import {
  catalogMediaSchema,
  type CatalogMedia,
  type LicenseRecord,
  type MediaWithLicense,
} from "@couch/contracts";
import { isUseAuthorized } from "@couch/shared";
import type {
  LicenseRecord as LicenseRow,
  Media as MediaRow,
} from "./generated/prisma/client";

// Pure mapping between database rows and the contracts types. No I/O, no clock
// and no database client, so all of it runs in the unit tests.

/** A media row together with its license row, as the repository fetches it. */
export type CatalogRow = MediaRow & { licenseRecord: LicenseRow };

/** Why a fetched row was kept out of the catalog. Never carries row contents. */
export type ExclusionReason = "inactive" | "malformed" | "unauthorized";

export type RowResult =
  | { readonly ok: true; readonly media: CatalogMedia }
  | { readonly ok: false; readonly reason: ExclusionReason };

/**
 * Formats a calendar date as `YYYY-MM-DD` from its UTC parts. Local parts would
 * shift the day in any time zone west of UTC, because a Postgres `date` reaches
 * JavaScript as a Date at UTC midnight.
 */
export function formatDateOnly(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The Date to store for a `YYYY-MM-DD` string: UTC midnight of that day. The
 * ISO string form is parsed on purpose, because `Date.UTC` and the multi-part
 * constructor treat years 0 to 99 as 1900 to 1999 and the latter uses local time.
 * The input is already checked by the contracts schema.
 */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** The columns of a license row for a validated contracts `LicenseRecord`. */
export function licenseToRowData(license: LicenseRecord) {
  return {
    licenseName: license.licenseName,
    licenseVersion: license.licenseVersion,
    licenseUrl: license.licenseUrl,
    sourceUrl: license.sourceUrl,
    rightsholder: license.rightsholder,
    attributionRequired: license.attributionRequired,
    attribution: license.attribution,
    intendedUseAllowed: license.intendedUseAllowed,
    commercialUseAllowed: license.commercialUseAllowed,
    additionalRestrictions: license.additionalRestrictions,
    verifiedAt: parseDateOnly(license.verifiedAt),
    verificationNotes: license.verificationNotes,
  };
}

/** The columns of a media row for a validated contracts `MediaWithLicense`. */
export function mediaToRowData(media: MediaWithLicense) {
  return {
    providerId: media.providerId,
    providerMediaId: media.providerMediaId,
    title: media.title,
    description: media.description,
    durationSeconds: media.durationSeconds,
    posterUrl: media.posterUrl,
    releaseYear: media.releaseYear,
  };
}

/**
 * Builds exactly the fields the strict ingest schema expects, and nothing else
 * (no `isActive`, no timestamps, no `licenseRecordId`). A nullable column stays
 * null. An empty string is NOT turned into null: it is left as it is, so the
 * schema rejects it and the row is excluded as malformed.
 *
 * The result is a candidate only. It has the right shape, but the refinements
 * (URL scheme, trimming, attribution rule, calendar date) are not checked until
 * `catalogMediaSchema` parses it. Use `validateRow` and never this alone.
 */
export function toCatalogCandidate(row: CatalogRow): CatalogMedia {
  const license = row.licenseRecord;
  return {
    id: row.id,
    providerId: row.providerId,
    providerMediaId: row.providerMediaId,
    title: row.title,
    description: row.description,
    durationSeconds: row.durationSeconds,
    posterUrl: row.posterUrl,
    releaseYear: row.releaseYear,
    license: {
      licenseName: license.licenseName,
      licenseVersion: license.licenseVersion,
      licenseUrl: license.licenseUrl,
      sourceUrl: license.sourceUrl,
      rightsholder: license.rightsholder,
      attributionRequired: license.attributionRequired,
      attribution: license.attribution,
      intendedUseAllowed: license.intendedUseAllowed,
      commercialUseAllowed: license.commercialUseAllowed,
      additionalRestrictions: license.additionalRestrictions,
      verifiedAt: formatDateOnly(license.verifiedAt),
      verificationNotes: license.verificationNotes,
    },
  };
}

/**
 * The gate every row passes before it leaves the repository: map, apply the
 * shared authorization predicate, then validate with the strict contracts
 * schema. The returned media is the schema's parsed output, not the raw mapping.
 *
 * The predicate runs first, on the unvalidated mapping, because it is written for
 * that (it re-checks the date and the attribution rule for rows that were never
 * schema-checked). A license that fails it is "unauthorized", so a row that has
 * `attributionRequired` with no attribution is reported as unauthorized and not
 * as malformed. Anything else the schema rejects is "malformed".
 *
 * An inactive row is excluded too. The repository also filters on `isActive` in
 * the query, and this check keeps the guarantee even if a query is changed.
 */
export function validateRow(row: CatalogRow): RowResult {
  if (!row.isActive) return { ok: false, reason: "inactive" };

  const candidate = toCatalogCandidate(row);
  if (!isUseAuthorized(candidate.license)) return { ok: false, reason: "unauthorized" };

  const parsed = catalogMediaSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, reason: "malformed" };
  return { ok: true, media: parsed.data };
}

/**
 * Escapes `\`, `%` and `_` so a search string is matched as literal text in a
 * `LIKE` pattern. Postgres uses backslash as the default escape character.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
