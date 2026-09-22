import { mediaWithLicenseSchema, type CatalogMedia, type MediaWithLicense } from "@couch/contracts";
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import {
  escapeLikePattern,
  licenseToRowData,
  mediaToRowData,
  validateRow,
  type ExclusionReason,
} from "./catalog-mapping";

// The catalog repository. The rule for every function here: nothing
// unauthorized, malformed or inactive leaves it. Every row that is read passes
// `validateRow` (`isUseAuthorized` from @couch/shared, then the contracts schema),
// and the queries also filter on `isActive` and `intendedUseAllowed`, so rows
// that cannot pass are not even fetched. There is no function that returns an
// unfiltered row and none that deletes media: a takedown is `isActive = false`.
//
// The client is a parameter, so callers and tests choose the database.

/** The largest page `listCatalogMedia` serves. */
export const MAX_CATALOG_PAGE_SIZE = 100;

/** A fetched row that was kept out of the result. Ids and reasons only, never row contents. */
export type CatalogExclusion = {
  readonly id: string;
  readonly reason: ExclusionReason;
};

export type OnExcluded = (exclusion: CatalogExclusion) => void;

export type ListCatalogMediaOptions = {
  /** Case-insensitive substring of the title. `%`, `_` and `\` are literal text. */
  readonly query?: string;
  /** An integer from 1 to `MAX_CATALOG_PAGE_SIZE`. Anything else throws a RangeError. */
  readonly limit: number;
  /** The `nextCursor` of the previous page. */
  readonly cursor?: string;
  /** Called once per fetched row that was excluded. */
  readonly onExcluded?: OnExcluded;
};

export type CatalogPage = {
  readonly items: CatalogMedia[];
  /** Pass it as `cursor` to get the next page. Null when there are no more rows. */
  readonly nextCursor: string | null;
};

export type GetCatalogMediaOptions = {
  readonly onExcluded?: OnExcluded;
};

// Rows the database can already rule out. The row check in `validateRow` still
// runs on everything that comes back.
const catalogFilter = {
  isActive: true,
  licenseRecord: { intendedUseAllowed: true },
} as const;

/**
 * Inserts or updates one media item and its license, keyed by
 * (`providerId`, `providerMediaId`), and sets `isActive` to true.
 *
 * The input is validated with the strict contracts ingest schema first, and a
 * failure throws before the database is touched. Calling it again with the same
 * key updates the same media row and the same license row in place.
 *
 * The write is one nested Prisma upsert, which Prisma runs in a single
 * transaction, so a media row and its license row are written together or not
 * at all. Two callers inserting the same new key at the same instant can still
 * make one of them fail with a unique constraint error. Sync runs one writer.
 *
 * The result passes the same gate as a read. It is `null` when the stored item
 * is not authorized (`intendedUseAllowed` is false). That item IS stored, so a
 * license that was revoked is recorded and the item stops appearing in the
 * catalog, but it is never handed back.
 */
export async function upsertCatalogMedia(
  db: PrismaClient,
  media: MediaWithLicense,
): Promise<CatalogMedia | null> {
  const input = mediaWithLicenseSchema.parse(media);
  const { providerId, providerMediaId, ...fields } = mediaToRowData(input);
  const license = licenseToRowData(input.license);

  const row = await db.media.upsert({
    where: { providerId_providerMediaId: { providerId, providerMediaId } },
    create: {
      providerId,
      providerMediaId,
      ...fields,
      isActive: true,
      licenseRecord: { create: license },
    },
    update: { ...fields, isActive: true, licenseRecord: { update: license } },
    include: { licenseRecord: true },
  });

  const result = validateRow(row);
  return result.ok ? result.media : null;
}

/**
 * Sets `isActive` to false for the rows of `providerId` whose `providerMediaId`
 * is not in `keepProviderMediaIds`, and returns how many rows it changed. Rows
 * that were already inactive are not counted. Other providers are never touched.
 *
 * An EMPTY keep list deactivates every active row of that provider. That is the
 * meaning of "the provider now offers nothing", so a caller that got an empty
 * list by mistake must check before calling.
 */
export async function deactivateMissing(
  db: PrismaClient,
  providerId: string,
  keepProviderMediaIds: string[],
): Promise<number> {
  const result = await db.media.updateMany({
    where: { providerId, isActive: true, providerMediaId: { notIn: keepProviderMediaIds } },
    data: { isActive: false },
  });
  return result.count;
}

/**
 * One page of the catalog, ordered by title and then id, both ascending.
 *
 * A page can be SHORTER than `limit`, even empty, because rows that fail
 * validation or the authorization check are excluded after they are fetched.
 * `nextCursor` is the id of the last row that was fetched for the page, kept or
 * not, so an excluded row never stalls the walk. Callers follow `nextCursor`
 * until it is null and never treat a short page as the last one. A cursor that
 * matches no row throws a RangeError. Rows are never deleted, so that is a
 * cursor the caller made up.
 *
 * Inactive rows and rows whose license has `intendedUseAllowed` false are not
 * fetched, so they are not reported to `onExcluded`. Rows that are fetched and
 * then rejected are, with an id and a reason.
 */
export async function listCatalogMedia(
  db: PrismaClient,
  options: ListCatalogMediaOptions,
): Promise<CatalogPage> {
  const { query, limit, cursor, onExcluded } = options;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CATALOG_PAGE_SIZE) {
    throw new RangeError(
      `limit must be an integer from 1 to ${MAX_CATALOG_PAGE_SIZE}`,
    );
  }

  // The client does not escape `%` and `_` in `contains`, so a bare `%` would
  // match every title. The pattern is escaped here instead.
  const titleFilter = query
    ? { title: { contains: escapeLikePattern(query), mode: "insensitive" as const } }
    : {};

  // Keyset paging: rows strictly after the cursor row in (title, id) order. The
  // cursor row is read without the catalog filter on purpose. It can have been
  // deactivated since the last page, and the client's own cursor option assumes
  // the cursor row is still in the filtered set, which would skip a valid row.
  let afterCursor = {};
  if (cursor !== undefined) {
    const anchor = await db.media.findUnique({
      where: { id: cursor },
      select: { id: true, title: true },
    });
    if (!anchor) throw new RangeError("cursor does not match a catalog row");
    afterCursor = {
      OR: [
        { title: { gt: anchor.title } },
        { title: anchor.title, id: { gt: anchor.id } },
      ],
    };
  }

  // One extra row tells whether another page exists.
  const rows = await db.media.findMany({
    where: { AND: [catalogFilter, titleFilter, afterCursor] },
    include: { licenseRecord: true },
    orderBy: [{ title: "asc" }, { id: "asc" }],
    take: limit + 1,
  });

  const page = rows.slice(0, limit);
  const items: CatalogMedia[] = [];
  for (const row of page) {
    const result = validateRow(row);
    if (result.ok) items.push(result.media);
    else onExcluded?.({ id: row.id, reason: result.reason });
  }

  const last = page[page.length - 1];
  return { items, nextCursor: rows.length > limit && last ? last.id : null };
}

/**
 * One catalog item by its internal id, under the same rules as
 * `listCatalogMedia`. Returns null for an id that does not exist and for an item
 * that is inactive, unauthorized or malformed. A row that is fetched and then
 * rejected is reported to `onExcluded`.
 *
 * The client type also accepts `Prisma.TransactionClient`, so a caller (for
 * example the couch repository's `setCurrentMedia`) can resolve media inside
 * its own transaction.
 */
export async function getCatalogMedia(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
  options: GetCatalogMediaOptions = {},
): Promise<CatalogMedia | null> {
  const row = await db.media.findFirst({
    where: { ...catalogFilter, id },
    include: { licenseRecord: true },
  });
  if (!row) return null;

  const result = validateRow(row);
  if (result.ok) return result.media;
  options.onExcluded?.({ id: row.id, reason: result.reason });
  return null;
}
