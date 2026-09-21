import * as z from "zod";
import { MEDIA_LIMITS, httpsUrl, trimmedText } from "./fields";
import { licenseRecordSchema, licenseRecordWireSchema } from "./license";

/**
 * The provider-side fields of a media item, WITHOUT a license and without an internal id.
 *
 * This is module-private on purpose, and it is a plain field map, not a schema. Nothing
 * can parse media without a license, because the only way out of this file is through
 * `withLicense`, which always adds one.
 */
const mediaBaseShape = {
  /** Provider slug: lowercase letters and digits in groups joined by single hyphens. */
  providerId: trimmedText(MEDIA_LIMITS.providerId).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: "providerId must be a lowercase slug",
  }),
  /** The provider's own id for the item. Opaque: Couch never interprets it. */
  providerMediaId: trimmedText(MEDIA_LIMITS.providerMediaId),
  title: trimmedText(MEDIA_LIMITS.title),
  description: trimmedText(MEDIA_LIMITS.description).nullable(),
  /** Length of the media in SECONDS. Positive and finite, or null when unknown. */
  durationSeconds: z.number().positive().nullable(),
  posterUrl: httpsUrl.nullable(),
  /** A calendar year within the sanity range in `MEDIA_LIMITS`, or null when unknown. */
  releaseYear: z
    .number()
    .int()
    .min(MEDIA_LIMITS.releaseYearMin)
    .max(MEDIA_LIMITS.releaseYearMax)
    .nullable(),
};

/**
 * The media fields plus a REQUIRED license. The license schema is a parameter so each
 * flavor nests the matching flavor of the license: an ingest media object contains a
 * strict license, a wire media object a tolerant one.
 */
const withLicense = <L extends z.ZodType>(license: L) => ({ ...mediaBaseShape, license });

/**
 * A media item as a provider returns it and a manifest contains it: media fields plus a
 * required license, with no internal id. INGEST flavor: unknown keys are rejected, at the
 * top level and inside the license.
 */
export const mediaWithLicenseSchema = z.strictObject(withLicense(licenseRecordSchema));

/**
 * A media item in the catalog: `MediaWithLicense` plus the internal catalog `id`. It goes
 * over the wire because the UI must display the attribution. INGEST flavor: unknown keys
 * are rejected. Use it for database upserts and anything else that authors catalog data.
 */
export const catalogMediaSchema = z.strictObject({
  id: trimmedText(MEDIA_LIMITS.catalogId),
  ...withLicense(licenseRecordSchema),
});

/**
 * `CatalogMedia`, WIRE flavor: unknown keys are stripped, at the top level and inside the
 * license. Use it for catalog media inside server messages, so an additive server change
 * never breaks an older client. Same fields and same rules as the ingest flavor.
 */
export const catalogMediaWireSchema = z.object({
  id: trimmedText(MEDIA_LIMITS.catalogId),
  ...withLicense(licenseRecordWireSchema),
});

/** Identifies a media item on its provider. Unknown keys are rejected. */
export const mediaRefSchema = z.strictObject({
  providerId: mediaBaseShape.providerId,
  providerMediaId: mediaBaseShape.providerMediaId,
});

export type MediaWithLicense = z.infer<typeof mediaWithLicenseSchema>;
export type CatalogMedia = z.infer<typeof catalogMediaSchema>;
export type MediaRef = z.infer<typeof mediaRefSchema>;
