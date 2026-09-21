import { randomUUID } from "node:crypto";
import type { CatalogMedia } from "@couch/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestMedia, fixtureMedia, newRunPrefix } from "./catalog-test-support";
import {
  assertDatabaseEnv,
  createPrismaClient,
  deactivateMissing,
  getCatalogMedia,
  listCatalogMedia,
  MAX_CATALOG_PAGE_SIZE,
  upsertCatalogMedia,
  type CatalogExclusion,
  type CatalogPage,
  type PrismaClient,
} from "./index";

assertDatabaseEnv(process.env, "test-suite");

// Every provider id in this file starts with a prefix that is unique to the run,
// and every title contains it, so this file never touches or lists other data.
const run = newRunPrefix();
const provider = (suffix: string) => `${run}-${suffix}`;
const title = (text: string) => `TEST FIXTURE ${run} ${text}`;

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createPrismaClient({ connectionString: process.env.DATABASE_URL ?? "" });
});

afterAll(async () => {
  await cleanupTestMedia(prisma, run);
  await prisma.$disconnect();
});

type RawMediaOptions = {
  providerId: string;
  providerMediaId: string;
  title: string;
  isActive?: boolean;
  posterUrl?: string | null;
  description?: string | null;
  intendedUseAllowed?: boolean;
  attributionRequired?: boolean;
  attribution?: string | null;
};

// Writes a license row and a media row with plain SQL, the way something other
// than the repository could, so the read path is tested against rows the
// repository never validated. Returns the media id.
async function insertRawMedia(options: RawMediaOptions): Promise<string> {
  const licenses = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "LicenseRecord" ("id", "licenseName", "licenseUrl", "sourceUrl",
      "attributionRequired", "attribution", "intendedUseAllowed", "commercialUseAllowed",
      "verifiedAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'TEST FIXTURE License', 'https://example.com/license',
      'https://example.com/source', ${options.attributionRequired ?? false},
      ${options.attribution ?? null}, ${options.intendedUseAllowed ?? true}, false,
      '2026-02-03'::date, now())
    RETURNING "id"`;
  const licenseId = licenses[0]!.id;
  const media = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "Media" ("id", "providerId", "providerMediaId", "title", "description",
      "posterUrl", "isActive", "licenseRecordId", "updatedAt")
    VALUES (gen_random_uuid()::text, ${options.providerId}, ${options.providerMediaId},
      ${options.title}, ${options.description ?? null}, ${options.posterUrl ?? null},
      ${options.isActive ?? true}, ${licenseId}, now())
    RETURNING "id"`;
  return media[0]!.id;
}

// Everything the list function returns for a query, across pages, restricted to
// one provider so rows from anywhere else in the database cannot interfere.
async function listFor(providerId: string, query?: string): Promise<CatalogMedia[]> {
  const found: CatalogMedia[] = [];
  let cursor: string | undefined;
  do {
    const page: CatalogPage = await listCatalogMedia(prisma, {
      limit: MAX_CATALOG_PAGE_SIZE,
      ...(query === undefined ? {} : { query }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    found.push(...page.items.filter((item) => item.providerId === providerId));
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return found;
}

describe("a media row needs a license row", () => {
  it("rejects raw SQL that inserts media with no license", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Media" ("id", "providerId", "providerMediaId", "title", "updatedAt")
        VALUES (gen_random_uuid()::text, ${provider("nolicense")}, 'x', ${title("no license")}, now())`,
    ).rejects.toThrow(/licenseRecordId/);
    expect(await prisma.media.count({ where: { providerId: provider("nolicense") } })).toBe(0);
  });

  it("rejects raw SQL that points at a license row that does not exist", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Media" ("id", "providerId", "providerMediaId", "title", "licenseRecordId", "updatedAt")
        VALUES (gen_random_uuid()::text, ${provider("nolicense")}, 'x', ${title("bad link")},
          ${randomUUID()}, now())`,
    ).rejects.toThrow(/foreign key|Media_licenseRecordId_fkey/i);
    expect(await prisma.media.count({ where: { providerId: provider("nolicense") } })).toBe(0);
  });

  it("rejects a create through the client that has no license", async () => {
    await expect(
      // Deliberately wrong input, to prove the client refuses it at runtime too.
      prisma.media.create({
        data: { providerId: provider("nolicense"), providerMediaId: "x", title: title("client") },
      } as never),
    ).rejects.toThrow();
    expect(await prisma.media.count({ where: { providerId: provider("nolicense") } })).toBe(0);
  });

  it("does not let two media rows share one license row", async () => {
    const saved = await upsertCatalogMedia(
      prisma,
      fixtureMedia(provider("onetoone"), "one", title("one to one")),
    );
    const row = await prisma.media.findFirstOrThrow({
      where: { providerId: provider("onetoone") },
    });
    expect(saved?.id).toBe(row.id);

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Media" ("id", "providerId", "providerMediaId", "title", "licenseRecordId", "updatedAt")
        VALUES (gen_random_uuid()::text, ${provider("onetoone")}, 'two', ${title("second")},
          ${row.licenseRecordId}, now())`,
    ).rejects.toThrow(/licenseRecordId|unique/i);
    expect(await prisma.media.count({ where: { providerId: provider("onetoone") } })).toBe(1);
  });

  it("refuses to delete a license row that a media row still uses", async () => {
    const row = await prisma.media.findFirstOrThrow({
      where: { providerId: provider("onetoone") },
    });
    await expect(
      prisma.licenseRecord.delete({ where: { id: row.licenseRecordId } }),
    ).rejects.toThrow();
    expect(await prisma.licenseRecord.count({ where: { id: row.licenseRecordId } })).toBe(1);
  });
});

describe("upsertCatalogMedia", () => {
  const providerId = provider("upsert");

  it("called twice leaves one media row and one license row, with the new values", async () => {
    const first = await upsertCatalogMedia(
      prisma,
      fixtureMedia(providerId, "item", title("Original"), {
        license: { attribution: "TEST FIXTURE original credit" },
      }),
    );
    const before = await prisma.media.findFirstOrThrow({ where: { providerId } });

    const second = await upsertCatalogMedia(
      prisma,
      fixtureMedia(providerId, "item", title("Updated"), {
        description: null,
        durationSeconds: 60,
        releaseYear: 2001,
        license: { attribution: "TEST FIXTURE updated credit", commercialUseAllowed: true },
      }),
    );

    expect(await prisma.media.count({ where: { providerId } })).toBe(1);
    const after = await prisma.media.findFirstOrThrow({
      where: { providerId },
      include: { licenseRecord: true },
    });
    // The same rows were updated in place, and no second license row was left behind.
    expect(after.id).toBe(before.id);
    expect(after.licenseRecordId).toBe(before.licenseRecordId);
    expect(await prisma.licenseRecord.count({ where: { id: before.licenseRecordId } })).toBe(1);
    expect(await prisma.licenseRecord.count({ where: { media: { providerId } } })).toBe(1);

    expect(first?.id).toBe(before.id);
    expect(second).toMatchObject({
      id: before.id,
      title: title("Updated"),
      description: null,
      durationSeconds: 60,
      releaseYear: 2001,
      license: { attribution: "TEST FIXTURE updated credit", commercialUseAllowed: true },
    });
    expect(after.title).toBe(title("Updated"));
    expect(after.licenseRecord.attribution).toBe("TEST FIXTURE updated credit");
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
  });

  it("sets isActive back to true", async () => {
    const other = provider("upsert-active");
    await upsertCatalogMedia(prisma, fixtureMedia(other, "item", title("Reactivated")));
    await deactivateMissing(prisma, other, []);
    const row = await prisma.media.findFirstOrThrow({ where: { providerId: other } });
    expect(row.isActive).toBe(false);
    expect(await getCatalogMedia(prisma, row.id)).toBeNull();

    await upsertCatalogMedia(prisma, fixtureMedia(other, "item", title("Reactivated")));
    expect((await prisma.media.findFirstOrThrow({ where: { providerId: other } })).isActive).toBe(true);
    expect(await getCatalogMedia(prisma, row.id)).not.toBeNull();
  });

  it("validates with the strict ingest schema before writing anything", async () => {
    const other = provider("upsert-invalid");
    const good = fixtureMedia(other, "item", title("Invalid"));
    const bad = [
      { ...good, extra: true },
      { ...good, posterUrl: "http://example.com/poster.png" },
      { ...good, license: { ...good.license, additionalRestrictons: "typo" } },
      { ...good, license: { ...good.license, attribution: null } },
    ];
    for (const media of bad) {
      // Deliberately wrong input: the function takes MediaWithLicense.
      await expect(upsertCatalogMedia(prisma, media as never)).rejects.toThrow();
    }
    expect(await prisma.media.count({ where: { providerId: other } })).toBe(0);
    expect(await prisma.licenseRecord.count({ where: { media: { providerId: other } } })).toBe(0);
  });

  it("stores a revoked license but never returns the item", async () => {
    const other = provider("upsert-revoke");
    const saved = await upsertCatalogMedia(prisma, fixtureMedia(other, "item", title("Revoke me")));
    expect(saved).not.toBeNull();
    const id = saved!.id;
    expect(await listFor(other)).toHaveLength(1);
    expect(await getCatalogMedia(prisma, id)).not.toBeNull();

    const revoked = await upsertCatalogMedia(
      prisma,
      fixtureMedia(other, "item", title("Revoke me"), { license: { intendedUseAllowed: false } }),
    );
    expect(revoked).toBeNull();
    // Stored, so the revocation is recorded, and still one row of each kind.
    expect(await prisma.media.count({ where: { providerId: other } })).toBe(1);
    expect(
      (await prisma.licenseRecord.findFirstOrThrow({ where: { media: { providerId: other } } }))
        .intendedUseAllowed,
    ).toBe(false);

    expect(await listFor(other)).toEqual([]);
    expect(await getCatalogMedia(prisma, id)).toBeNull();

    // A later authorized upsert brings it back.
    await upsertCatalogMedia(prisma, fixtureMedia(other, "item", title("Revoke me")));
    expect(await listFor(other)).toHaveLength(1);
  });
});

describe("rows written with SQL that bypass the repository", () => {
  const providerId = provider("raw");
  const excluded: CatalogExclusion[] = [];
  let ids: Record<string, string>;

  beforeAll(async () => {
    await upsertCatalogMedia(prisma, fixtureMedia(providerId, "good", title("Raw control good")));
    ids = {
      notAllowed: await insertRawMedia({
        providerId,
        providerMediaId: "not-allowed",
        title: title("Raw intendedUseAllowed false"),
        intendedUseAllowed: false,
      }),
      noAttribution: await insertRawMedia({
        providerId,
        providerMediaId: "no-attribution",
        title: title("Raw attribution missing"),
        attributionRequired: true,
        attribution: null,
      }),
      httpPoster: await insertRawMedia({
        providerId,
        providerMediaId: "http-poster",
        title: title("Raw http poster"),
        posterUrl: "http://example.com/poster.png",
      }),
      emptyDescription: await insertRawMedia({
        providerId,
        providerMediaId: "empty-description",
        title: title("Raw empty description"),
        description: "",
      }),
      inactive: await insertRawMedia({
        providerId,
        providerMediaId: "inactive",
        title: title("Raw inactive"),
        isActive: false,
      }),
    };
  });

  it("lists only the good row", async () => {
    const listed: CatalogMedia[] = [];
    let cursor: string | undefined;
    do {
      const page: CatalogPage = await listCatalogMedia(prisma, {
        limit: MAX_CATALOG_PAGE_SIZE,
        query: run,
        ...(cursor === undefined ? {} : { cursor }),
        onExcluded: (exclusion) => excluded.push(exclusion),
      });
      listed.push(...page.items.filter((item) => item.providerId === providerId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    expect(listed.map((item) => item.title)).toEqual([title("Raw control good")]);
  });

  it("reports the rows that were fetched and then rejected, with id and reason only", () => {
    const mine = excluded.filter((entry) =>
      [ids.noAttribution, ids.httpPoster, ids.emptyDescription].includes(entry.id),
    );
    expect(mine).toHaveLength(3);
    expect(mine).toContainEqual({ id: ids.noAttribution, reason: "unauthorized" });
    expect(mine).toContainEqual({ id: ids.httpPoster, reason: "malformed" });
    expect(mine).toContainEqual({ id: ids.emptyDescription, reason: "malformed" });
    for (const entry of mine) expect(Object.keys(entry).sort()).toEqual(["id", "reason"]);
    expect(JSON.stringify(mine)).not.toContain("example.com");
    // Rows the query already rules out are never fetched, so they are not reported.
    const reportedIds = excluded.map((entry) => entry.id);
    expect(reportedIds).not.toContain(ids.notAllowed);
    expect(reportedIds).not.toContain(ids.inactive);
  });

  it("returns null from get for every one of them", async () => {
    for (const id of Object.values(ids)) {
      expect(await getCatalogMedia(prisma, id)).toBeNull();
    }
  });

  it("reports a fetched and rejected row from get too", async () => {
    const seen: CatalogExclusion[] = [];
    expect(
      await getCatalogMedia(prisma, ids.httpPoster!, { onExcluded: (entry) => seen.push(entry) }),
    ).toBeNull();
    expect(seen).toEqual([{ id: ids.httpPoster, reason: "malformed" }]);
  });
});

describe("deactivateMissing", () => {
  const a = provider("deact-a");
  const b = provider("deact-b");

  beforeAll(async () => {
    for (const id of ["1", "2", "3"]) {
      await upsertCatalogMedia(prisma, fixtureMedia(a, `a${id}`, title(`Deact A${id}`)));
    }
    for (const id of ["1", "2"]) {
      await upsertCatalogMedia(prisma, fixtureMedia(b, `b${id}`, title(`Deact B${id}`)));
    }
  });

  const activeTitles = async (providerId: string) =>
    (await listFor(providerId, `${run} Deact`)).map((item) => item.providerMediaId).sort();

  it("deactivates only that provider's rows that are not in the keep list", async () => {
    expect(await deactivateMissing(prisma, a, ["a1"])).toBe(2);
    expect(await activeTitles(a)).toEqual(["a1"]);
    expect(await activeTitles(b)).toEqual(["b1", "b2"]);
  });

  it("does not count rows that were already inactive", async () => {
    expect(await deactivateMissing(prisma, a, ["a1"])).toBe(0);
  });

  it("ignores keep ids that do not exist", async () => {
    expect(await deactivateMissing(prisma, a, ["a1", "nope"])).toBe(0);
    expect(await activeTitles(a)).toEqual(["a1"]);
  });

  it("deactivates every active row of the provider when the keep list is empty", async () => {
    expect(await deactivateMissing(prisma, a, [])).toBe(1);
    expect(await activeTitles(a)).toEqual([]);
    expect(await activeTitles(b)).toEqual(["b1", "b2"]);
    expect(await deactivateMissing(prisma, b, [])).toBe(2);
    expect(await activeTitles(b)).toEqual([]);
    // The rows are kept, inactive, and never deleted.
    expect(await prisma.media.count({ where: { providerId: { in: [a, b] } } })).toBe(5);
  });
});

describe("search", () => {
  const providerId = provider("search");
  const wanted = async (query: string) =>
    (await listFor(providerId, query)).map((item) => item.title.replace(`TEST FIXTURE ${run} `, ""));

  beforeAll(async () => {
    const titles = [
      "Alpha Movie",
      "100% Real",
      "100 X Real",
      "a_b",
      "aXb",
      // One backslash in the text.
      "back\\slash",
    ];
    for (const [index, text] of titles.entries()) {
      await upsertCatalogMedia(prisma, fixtureMedia(providerId, `s${index}`, title(text)));
    }
  });

  it("matches a substring of the title", async () => {
    expect(await wanted("pha mov")).toEqual(["Alpha Movie"]);
  });

  it("ignores case", async () => {
    expect(await wanted("ALPHA movie")).toEqual(["Alpha Movie"]);
    expect(await wanted("alpha MOVIE")).toEqual(["Alpha Movie"]);
  });

  it("treats a percent sign as literal text", async () => {
    expect(await wanted("%")).toEqual(["100% Real"]);
    expect(await wanted("100%")).toEqual(["100% Real"]);
    expect(await wanted("%%")).toEqual([]);
  });

  it("treats an underscore as literal text", async () => {
    expect(await wanted("_")).toEqual(["a_b"]);
    expect(await wanted("a_b")).toEqual(["a_b"]);
    expect(await wanted("A_B")).toEqual(["a_b"]);
  });

  it("treats a backslash as literal text", async () => {
    expect(await wanted("\\")).toEqual(["back\\slash"]);
    expect(await wanted("back\\")).toEqual(["back\\slash"]);
    expect(await wanted("\\%")).toEqual([]);
    expect(await wanted("100\\%")).toEqual([]);
  });

  it("returns everything of ours for an empty query", async () => {
    expect(await wanted("")).toHaveLength(6);
  });
});

describe("pagination", () => {
  const providerId = provider("page");
  let ids: Record<string, string>;

  beforeAll(async () => {
    const good = async (key: string, text: string) =>
      (await upsertCatalogMedia(prisma, fixtureMedia(providerId, key, title(text))))!.id;
    ids = {
      p1: await good("p1", "Page 1"),
      p2: await good("p2", "Page 2"),
      p3a: await good("p3a", "Page 3"),
      p3b: await good("p3b", "Page 3"),
      p4: await good("p4", "Page 4"),
      // Sorts between "Page 1" and "Page 2", and is rejected on the way out.
      bad: await insertRawMedia({
        providerId,
        providerMediaId: "bad",
        title: title("Page 15"),
        posterUrl: "http://example.com/poster.png",
      }),
    };
  });

  async function walk(limit: number) {
    const pages: CatalogPage[] = [];
    const excluded: CatalogExclusion[] = [];
    let cursor: string | undefined;
    do {
      const page: CatalogPage = await listCatalogMedia(prisma, {
        limit,
        query: `${run} Page`,
        ...(cursor === undefined ? {} : { cursor }),
        onExcluded: (entry) => excluded.push(entry),
      });
      pages.push(page);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return { pages, excluded };
  }

  it("orders by title, then id, and walks every page to a null cursor", async () => {
    const { pages, excluded } = await walk(2);
    const flat = pages.flatMap((page) => page.items);

    expect(flat.map((item) => item.title.replace(`TEST FIXTURE ${run} `, ""))).toEqual([
      "Page 1",
      "Page 2",
      "Page 3",
      "Page 3",
      "Page 4",
    ]);
    // Same title: the lower id comes first.
    const same = flat.filter((item) => item.title === title("Page 3")).map((item) => item.id);
    expect(same).toEqual([...same].sort());
    expect(new Set(same)).toEqual(new Set([ids.p3a, ids.p3b]));

    expect(pages.at(-1)?.nextCursor).toBeNull();
    expect(pages.slice(0, -1).every((page) => page.nextCursor !== null)).toBe(true);
    expect(excluded).toEqual([{ id: ids.bad, reason: "malformed" }]);
  });

  it("can return a page shorter than the limit because of an exclusion", async () => {
    const { pages } = await walk(2);
    expect(pages.map((page) => page.items.length)).toEqual([1, 2, 2]);
    // The short first page still has a cursor, so the walk goes on.
    expect(pages[0]?.nextCursor).not.toBeNull();
  });

  it("gives the same order on every walk and for every page size", async () => {
    const reference = (await walk(MAX_CATALOG_PAGE_SIZE)).pages.flatMap((page) => page.items);
    expect(reference).toHaveLength(5);
    for (const limit of [1, 2, 3, 4, 5]) {
      const paged = (await walk(limit)).pages.flatMap((page) => page.items);
      expect(paged.map((item) => item.id)).toEqual(reference.map((item) => item.id));
    }
  });

  it("returns a null cursor when everything fits on one page", async () => {
    const { pages } = await walk(MAX_CATALOG_PAGE_SIZE);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.nextCursor).toBeNull();
  });

  it("rejects a limit that is not an integer from 1 to the maximum", async () => {
    for (const limit of [0, -1, 1.5, Number.NaN, MAX_CATALOG_PAGE_SIZE + 1]) {
      await expect(listCatalogMedia(prisma, { limit })).rejects.toThrow(RangeError);
    }
    await expect(
      listCatalogMedia(prisma, { limit: MAX_CATALOG_PAGE_SIZE }),
    ).resolves.toBeDefined();
  });
});

describe("cursor", () => {
  const providerId = provider("cursor");
  const query = `${run} Cursor`;
  let ids: string[];

  beforeAll(async () => {
    ids = [];
    for (const n of [1, 2, 3, 4]) {
      const saved = await upsertCatalogMedia(
        prisma,
        fixtureMedia(providerId, `c${n}`, title(`Cursor ${n}`)),
      );
      ids.push(saved!.id);
    }
  });

  it("does not skip a row when the cursor row was deactivated after the last page", async () => {
    const first = await listCatalogMedia(prisma, { limit: 2, query });
    expect(first.items.map((item) => item.id)).toEqual([ids[0], ids[1]]);
    expect(first.nextCursor).toBe(ids[1]);

    // The row the cursor points at leaves the catalog between two page requests.
    expect(await deactivateMissing(prisma, providerId, ["c1", "c3", "c4"])).toBe(1);

    const second = await listCatalogMedia(prisma, { limit: 2, query, cursor: first.nextCursor! });
    expect(second.items.map((item) => item.id)).toEqual([ids[2], ids[3]]);
    expect(second.nextCursor).toBeNull();
  });

  it("throws for a cursor that matches no row", async () => {
    await expect(
      listCatalogMedia(prisma, { limit: 2, query, cursor: randomUUID() }),
    ).rejects.toThrow(RangeError);
    await expect(listCatalogMedia(prisma, { limit: 2, query, cursor: "" })).rejects.toThrow(
      RangeError,
    );
  });
});

describe("verifiedAt", () => {
  const providerId = provider("dates");
  const dates = [
    "2024-02-29",
    "2026-01-01",
    "2026-12-31",
    "2026-03-08",
    "1994-12-31",
    "1999-12-31",
    "0999-01-01",
  ];

  it("round-trips as the same YYYY-MM-DD string, in whatever time zone the process runs", async () => {
    for (const [index, verifiedAt] of dates.entries()) {
      const saved = await upsertCatalogMedia(
        prisma,
        fixtureMedia(providerId, `d${index}`, title(`Date ${verifiedAt}`), {
          license: { verifiedAt },
        }),
      );
      expect(saved?.license.verifiedAt).toBe(verifiedAt);

      const fetched = await getCatalogMedia(prisma, saved!.id);
      expect(fetched?.license.verifiedAt).toBe(verifiedAt);

      // What the column actually holds, read as text so no time zone can touch it.
      const stored = await prisma.$queryRaw<{ text: string }[]>`
        SELECT "verifiedAt"::text AS text FROM "LicenseRecord" l
        JOIN "Media" m ON m."licenseRecordId" = l."id" WHERE m."id" = ${saved!.id}`;
      expect(stored[0]?.text).toBe(verifiedAt);
    }

    const listed = await listFor(providerId, `${run} Date`);
    expect(listed.map((item) => item.license.verifiedAt).sort()).toEqual([...dates].sort());
  });
});

describe("nullable fields", () => {
  it("come back as null, never undefined or an empty string", async () => {
    const input = fixtureMedia(provider("nulls"), "item", title("All nulls"), {
      description: null,
      durationSeconds: null,
      posterUrl: null,
      releaseYear: null,
      license: {
        licenseVersion: null,
        rightsholder: null,
        attributionRequired: false,
        attribution: null,
        additionalRestrictions: null,
        verificationNotes: null,
      },
    });
    const saved = await upsertCatalogMedia(prisma, input);
    expect(saved).toStrictEqual({ id: saved!.id, ...input });

    const fetched = await getCatalogMedia(prisma, saved!.id);
    expect(fetched).toStrictEqual(saved);
    expect(fetched?.license.attribution).toBeNull();
  });

  it("keeps a fractional duration exactly", async () => {
    const saved = await upsertCatalogMedia(
      prisma,
      fixtureMedia(provider("nulls"), "duration", title("Duration"), {
        durationSeconds: 5400.123456789,
      }),
    );
    expect((await getCatalogMedia(prisma, saved!.id))?.durationSeconds).toBe(5400.123456789);
  });
});
