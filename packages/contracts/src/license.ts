import * as z from "zod";
import { MEDIA_LIMITS, httpsUrl, trimmedText } from "./fields";

/**
 * The fields of a license record. Both flavors below are built from this one object, so
 * they cannot drift apart. Every value here is entered by someone who verified the source.
 * Nothing may be guessed, inferred or filled in from memory.
 */
const licenseShape = {
  /**
   * The license's name exactly as the licensor publishes it. Verify it against the
   * licensor's own license text, not a summary or a third-party listing.
   */
  licenseName: trimmedText(MEDIA_LIMITS.licenseName),

  /**
   * The license version as the licensor publishes it, or null when the license has no
   * version. Verify the version of the text that applies to this item, since versions of
   * a license can differ in what they allow.
   */
  licenseVersion: trimmedText(MEDIA_LIMITS.licenseVersion).nullable(),

  /**
   * The https URL of the license text itself, on the licensor's site. Verify that it
   * resolves to the license named in `licenseName`.
   */
  licenseUrl: httpsUrl,

  /**
   * The https URL of the page where a maintainer verified BOTH the item and its license.
   * Verify that this page ties this specific item to this license, so the claim can be
   * re-checked later.
   */
  sourceUrl: httpsUrl,

  /**
   * The original creator or rightsholder, or null when the source does not name one.
   * Verify the name against the source. Do not infer it from a channel or uploader name.
   */
  rightsholder: trimmedText(MEDIA_LIMITS.rightsholder).nullable(),

  /**
   * Whether the license or the source requires credit to be shown. Verify it in the
   * license text. When true, `attribution` must hold the credit text.
   */
  attributionRequired: z.boolean(),

  /**
   * The credit text the UI displays, worded as the license or the source asks, or null
   * when none is needed. Verify the wording against the requirement. Required and
   * non-empty when `attributionRequired` is true.
   */
  attribution: trimmedText(MEDIA_LIMITS.attribution).nullable(),

  /**
   * Whether the INTENDED USE is permitted: synchronized remote viewing, meaning several
   * people in different places watching the same item at the same time, each streamed
   * through the provider's own authorized playback. Couch never copies, hosts or
   * redistributes the media itself.
   * Verify that the license, and the provider's terms where they apply, allow exactly
   * that. A license that allows personal viewing does not automatically allow shared
   * synchronized viewing. If it is unclear, this is false.
   *
   * Not the same as `commercialUseAllowed`. This field answers "may Couch show it this
   * way". The other answers "does the license allow commercial use in general".
   */
  intendedUseAllowed: z.boolean(),

  /**
   * Whether the license allows COMMERCIAL use in general, for example the absence of a
   * NonCommercial term. Verify it in the license text. It is recorded separately from
   * `intendedUseAllowed` because the two are independent: an item can allow the intended
   * use but not commercial use, and a deployment that changes its commercial status needs
   * to find the affected items. If it is unclear, this is false.
   */
  commercialUseAllowed: z.boolean(),

  /**
   * Any further restriction that the license or source imposes beyond the fields above
   * (regional limits, no-derivatives terms, time limits, and so on), or null when a
   * maintainer read the terms and found none. Verify by reading the terms in full. Null
   * means "checked, nothing", never "not checked".
   */
  additionalRestrictions: trimmedText(MEDIA_LIMITS.additionalRestrictions).nullable(),

  /**
   * The calendar date (YYYY-MM-DD, a real date) on which a maintainer last verified the
   * item, its license and the source. Set it to the actual verification date. Licenses
   * change, so an old date signals that the record needs re-checking. This package has
   * no clock, so it does not check the date against today.
   */
  verifiedAt: z.iso.date(),

  /**
   * Free-form notes from the verification, or null. Record what was checked and anything
   * unusual (for example, how the license was matched to the item).
   */
  verificationNotes: trimmedText(MEDIA_LIMITS.verificationNotes).nullable(),
};

/** Fields the attribution rule reads. */
type AttributionFields = { attributionRequired: boolean; attribution: string | null };

/**
 * The attribution rule: when `attributionRequired` is true, `attribution` must be
 * non-empty after trimming. The field schema already trims and rejects an empty string, so
 * this catches null, and it re-checks the trimmed length so the rule holds on its own.
 * The same refinement is applied to both flavors.
 */
const withAttributionRule = <T extends z.ZodType<AttributionFields>>(schema: T): T =>
  schema.refine(
    (license) =>
      !license.attributionRequired || (license.attribution ?? "").trim().length > 0,
    {
      path: ["attribution"],
      error: "attribution must be a non-empty string when attributionRequired is true",
    },
  );

/**
 * The license record, INGEST flavor: unknown keys are rejected. Use it for provider
 * output, catalog manifests and database upserts. A misspelled key such as
 * `additionalRestrictons` fails loudly instead of being stripped, because a silently
 * dropped restriction is a licensing bug.
 */
export const licenseRecordSchema = withAttributionRule(z.strictObject(licenseShape));

/**
 * The license record, WIRE flavor: unknown keys are stripped. Use it only for a license
 * received from the server, so an additive server change never breaks an older client.
 * Same fields and same rules as the ingest flavor.
 */
export const licenseRecordWireSchema = withAttributionRule(z.object(licenseShape));

export type LicenseRecord = z.infer<typeof licenseRecordSchema>;
