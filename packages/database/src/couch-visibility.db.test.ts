import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestMedia, fixtureMedia, newRunPrefix } from "./catalog-test-support";
import { cleanupTestCouches, createTestUser } from "./couch-test-support";
import {
  assertDatabaseEnv,
  createCouch,
  createPrismaClient,
  getCouch,
  joinCouch,
  listPublicCouches,
  MAX_CATALOG_PAGE_SIZE,
  setCouchVisibility,
  setCurrentMedia,
  upsertCatalogMedia,
  type PrismaClient,
} from "./index";

assertDatabaseEnv(process.env, "test-suite");

// listPublicCouches reads every public couch in the database, so each test
// searches by this run's unique tag and only sees its own couches.
const providerPrefix = newRunPrefix();
const run = randomBytes(4).toString("hex");
const userIds: string[] = [];
const MISSING_ID = "00000000-0000-7000-8000-000000000000";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createPrismaClient({ connectionString: process.env.DATABASE_URL ?? "" });
});

afterAll(async () => {
  await cleanupTestCouches(prisma, userIds);
  await cleanupTestMedia(prisma, providerPrefix);
  await prisma.$disconnect();
});

async function makeUser(label: string) {
  const user = await createTestUser(prisma, label);
  userIds.push(user.id);
  return user;
}

const name = (text: string) => `TEST FIXTURE ${run} ${text}`;
const shortName = (full: string) => full.replace(`TEST FIXTURE ${run} `, "");

async function listedNames(query: string): Promise<string[]> {
  const page = await listPublicCouches(prisma, { query, limit: MAX_CATALOG_PAGE_SIZE });
  return page.items.map((item) => shortName(item.name));
}

async function mediaOf(text: string) {
  const page = await listPublicCouches(prisma, { query: name(text), limit: 10 });
  return page.items[0]?.media;
}

describe("createCouch visibility", () => {
  it("defaults to private and honors isPublic", async () => {
    const owner = await makeUser("default");
    const implicit = await createCouch(prisma, { ownerId: owner.id, name: name("implicit") });
    const priv = await createCouch(prisma, { ownerId: owner.id, name: name("explicit private"), isPublic: false });
    const pub = await createCouch(prisma, { ownerId: owner.id, name: name("explicit public"), isPublic: true });

    expect(implicit.couch.isPublic).toBe(false);
    expect(priv.couch.isPublic).toBe(false);
    expect(pub.couch.isPublic).toBe(true);
    expect(implicit.membership.role).toBe("host");
    expect(pub.membership.role).toBe("host");
  });
});

describe("listPublicCouches", () => {
  it("lists only public couches", async () => {
    const owner = await makeUser("only-public");
    await createCouch(prisma, { ownerId: owner.id, name: name("only-public private"), isPublic: false });
    await createCouch(prisma, { ownerId: owner.id, name: name("only-public public"), isPublic: true });

    expect(await listedNames("only-public")).toEqual(["only-public public"]);
  });

  it("reports the member count and no media for a couch with none", async () => {
    const owner = await makeUser("count-owner");
    const guest = await makeUser("count-guest");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("count"), isPublic: true });
    await joinCouch(prisma, { couchId: couch.id, userId: guest.id });

    const page = await listPublicCouches(prisma, { query: name("count"), limit: 10 });
    expect(page.items).toEqual([{ id: couch.id, name: name("count"), memberCount: 2, media: null }]);
    expect(page.nextCursor).toBeNull();
  });

  it("reports the current media's title and poster", async () => {
    const owner = await makeUser("media-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("with media"), isPublic: true });
    const media = await upsertCatalogMedia(
      prisma,
      fixtureMedia(providerPrefix, "visible", "TEST FIXTURE Visible Film"),
    );
    if (!media) throw new Error("expected media to be saved");
    const set = await setCurrentMedia(prisma, { couchId: couch.id, actingUserId: owner.id, mediaId: media.id });
    expect(set.ok).toBe(true);

    expect(await mediaOf("with media")).toEqual({
      title: "TEST FIXTURE Visible Film",
      posterUrl: "https://example.com/poster.png",
    });
  });

  it("reports null media when the current media was taken down or lost its license", async () => {
    const owner = await makeUser("takedown-owner");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("takedown"), isPublic: true });
    const media = await upsertCatalogMedia(
      prisma,
      fixtureMedia(providerPrefix, "takedown", "TEST FIXTURE Takedown Film"),
    );
    if (!media) throw new Error("expected media to be saved");
    await setCurrentMedia(prisma, { couchId: couch.id, actingUserId: owner.id, mediaId: media.id });
    expect(await mediaOf("takedown")).not.toBeNull();

    // Takedown: the row and the stored id stay, the listing reports no media.
    await prisma.media.update({ where: { id: media.id }, data: { isActive: false } });
    expect((await getCouch(prisma, couch.id))?.currentMediaId).toBe(media.id);
    expect(await mediaOf("takedown")).toBeNull();

    // Reactivated, then the license stops allowing the intended use.
    await prisma.media.update({ where: { id: media.id }, data: { isActive: true } });
    expect(await mediaOf("takedown")).not.toBeNull();
    await prisma.licenseRecord.updateMany({
      where: { media: { id: media.id } },
      data: { intendedUseAllowed: false },
    });
    expect(await mediaOf("takedown")).toBeNull();
  });

  it("pages by name then id and follows nextCursor to the end", async () => {
    const owner = await makeUser("paging");
    for (const label of ["c", "a", "b", "d", "e"]) {
      await createCouch(prisma, { ownerId: owner.id, name: name(`paging ${label}`), isPublic: true });
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listPublicCouches(prisma, { query: name("paging"), limit: 2, cursor });
      seen.push(...page.items.map((item) => shortName(item.name)));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor !== undefined);
    expect(seen).toEqual(["paging a", "paging b", "paging c", "paging d", "paging e"]);
    expect(pages).toBe(3);
  });

  it("does not skip a couch when the cursor couch went private between pages", async () => {
    const owner = await makeUser("cursor-private");
    const made = [];
    for (const label of ["a", "b", "c"]) {
      made.push(
        await createCouch(prisma, { ownerId: owner.id, name: name(`cursor-private ${label}`), isPublic: true }),
      );
    }
    const first = await listPublicCouches(prisma, { query: name("cursor-private"), limit: 1 });
    const firstId = made[0]?.couch.id ?? "";
    expect(first.nextCursor).toBe(firstId);
    await setCouchVisibility(prisma, { couchId: firstId, actingUserId: owner.id, isPublic: false });
    const second = await listPublicCouches(prisma, {
      query: name("cursor-private"),
      limit: 10,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((item) => shortName(item.name))).toEqual([
      "cursor-private b",
      "cursor-private c",
    ]);
  });

  it("rejects a bad limit and an unknown cursor", async () => {
    await expect(listPublicCouches(prisma, { limit: 0 })).rejects.toThrow(RangeError);
    await expect(listPublicCouches(prisma, { limit: 1.5 })).rejects.toThrow(RangeError);
    await expect(listPublicCouches(prisma, { limit: MAX_CATALOG_PAGE_SIZE + 1 })).rejects.toThrow(RangeError);
    await expect(listPublicCouches(prisma, { limit: 5, cursor: MISSING_ID })).rejects.toThrow(RangeError);
  });
});

describe("listPublicCouches search", () => {
  beforeAll(async () => {
    const owner = await makeUser("search");
    const names = [
      "search Alpha Movie",
      "search 100% Real",
      "search 100 X Real",
      "search a_b",
      "search aXb",
      "search back\\slash",
    ];
    for (const text of names) {
      await createCouch(prisma, { ownerId: owner.id, name: name(text), isPublic: true });
    }
  });

  // Every query is prefixed with this run's tag so other rows never match.
  const wanted = (query: string) => listedNames(`${name("search")} ${query}`);

  it("matches a substring, ignoring case", async () => {
    expect(await wanted("alpha mov")).toEqual(["search Alpha Movie"]);
    expect(await wanted("ALPHA movie")).toEqual(["search Alpha Movie"]);
  });

  it("treats a percent sign as literal text", async () => {
    expect(await wanted("100%")).toEqual(["search 100% Real"]);
    expect(await wanted("100 %")).toEqual([]);
    expect(await listedNames(`${name("search")} 100%%`)).toEqual([]);
    expect(await wanted("%")).toEqual([]);
  });

  it("treats an underscore as literal text", async () => {
    expect(await wanted("a_b")).toEqual(["search a_b"]);
    expect(await wanted("A_B")).toEqual(["search a_b"]);
  });

  it("treats a backslash as literal text", async () => {
    expect(await wanted("back\\")).toEqual(["search back\\slash"]);
    expect(await wanted("100\\%")).toEqual([]);
  });

  it("matches a bare wildcard character only where it is literal", async () => {
    // Without the run prefix: a bare "%" or "_" must match names that contain
    // the character, not every name. Ours are the only fixtures with them.
    const pct = (await listedNames("%")).filter((n) => n.startsWith("search"));
    expect(pct).toEqual(["search 100% Real"]);
    const underscore = (await listedNames("_")).filter((n) => n.startsWith("search"));
    expect(underscore).toEqual(["search a_b"]);
    const backslash = (await listedNames("\\")).filter((n) => n.startsWith("search"));
    expect(backslash).toEqual(["search back\\slash"]);
  });

  it("returns all of this run's public couches for the shared prefix", async () => {
    expect(await listedNames(name("search"))).toHaveLength(6);
  });
});

describe("setCouchVisibility", () => {
  it("lets the host toggle visibility on and off", async () => {
    const owner = await makeUser("toggle");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("toggle") });
    expect(await listedNames("toggle")).toEqual([]);

    const on = await setCouchVisibility(prisma, { couchId: couch.id, actingUserId: owner.id, isPublic: true });
    expect(on.ok && on.value.isPublic).toBe(true);
    expect(await listedNames("toggle")).toEqual(["toggle"]);

    const off = await setCouchVisibility(prisma, { couchId: couch.id, actingUserId: owner.id, isPublic: false });
    expect(off.ok && off.value.isPublic).toBe(false);
    expect((await getCouch(prisma, couch.id))?.isPublic).toBe(false);
    expect(await listedNames("toggle")).toEqual([]);
  });

  it("refuses a participant and a non-member, leaving visibility unchanged", async () => {
    const owner = await makeUser("refuse-owner");
    const member = await makeUser("refuse-member");
    const stranger = await makeUser("refuse-stranger");
    const { couch } = await createCouch(prisma, { ownerId: owner.id, name: name("refuse"), isPublic: true });
    await joinCouch(prisma, { couchId: couch.id, userId: member.id });

    for (const actor of [member, stranger]) {
      expect(
        await setCouchVisibility(prisma, { couchId: couch.id, actingUserId: actor.id, isPublic: false }),
      ).toEqual({ ok: false, error: "forbidden" });
    }
    expect((await getCouch(prisma, couch.id))?.isPublic).toBe(true);

    const priv = await createCouch(prisma, { ownerId: owner.id, name: name("refuse private") });
    expect(
      await setCouchVisibility(prisma, { couchId: priv.couch.id, actingUserId: member.id, isPublic: true }),
    ).toEqual({ ok: false, error: "forbidden" });
    expect((await getCouch(prisma, priv.couch.id))?.isPublic).toBe(false);
  });

  it("returns couch_not_found for a nonexistent couch", async () => {
    const user = await makeUser("missing");
    expect(
      await setCouchVisibility(prisma, { couchId: MISSING_ID, actingUserId: user.id, isPublic: true }),
    ).toEqual({ ok: false, error: "couch_not_found" });
  });
});
