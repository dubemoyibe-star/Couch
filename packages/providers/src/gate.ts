import { mediaWithLicenseSchema, type MediaWithLicense } from "@couch/contracts";
import { isUseAuthorized } from "@couch/shared";

/**
 * Why the license gate rejected a candidate item.
 *
 * - `malformed`: the candidate fails the contracts strict ingest schema (missing or wrong
 *   fields, no license at all, an extra key, and so on).
 * - `unauthorized`: the candidate parses, but its license fails `isUseAuthorized` (for
 *   example `intendedUseAllowed` is false, or attribution is required and missing).
 */
export const MEDIA_REJECTION_REASONS = ["malformed", "unauthorized"] as const;
export type MediaRejectionReason = (typeof MEDIA_REJECTION_REASONS)[number];

/** One item the gate kept out. Never carries the candidate's own fields beyond its ids. */
export type MediaRejection = {
  readonly providerId: string;
  readonly providerMediaId: string;
  readonly reason: MediaRejectionReason;
};

export type GateResult =
  | { readonly ok: true; readonly media: MediaWithLicense }
  | { readonly ok: false; readonly rejection: MediaRejection };

function readStringField(candidate: unknown, key: "providerId" | "providerMediaId"): string | undefined {
  if (typeof candidate !== "object" || candidate === null) return undefined;
  const value = (candidate as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Best-effort ids for a rejection report, read directly off the untrusted candidate (a
 * malformed candidate may still carry usable ids even though it fails the schema). Falls
 * back to `fallbackProviderId` (the provider that returned it) and `"unknown"`.
 */
function rejectionRefOf(candidate: unknown, fallbackProviderId: string): { providerId: string; providerMediaId: string } {
  return {
    providerId: readStringField(candidate, "providerId") ?? fallbackProviderId,
    providerMediaId: readStringField(candidate, "providerMediaId") ?? "unknown",
  };
}

/**
 * The license gate every media item passes before it may leave the registry: parse against
 * the strict ingest `MediaWithLicense` schema, then apply the shared `isUseAuthorized`
 * predicate. `candidate` is treated as `unknown`, never as an already-trusted
 * `MediaWithLicense`, because a provider is external code and its return value is not
 * guaranteed to match the type it declares at compile time.
 *
 * Parses first (unlike `@couch/database`'s `validateRow`, which runs the predicate on an
 * already-typed mapping): here the candidate is genuinely unknown, so reading `.license`
 * fields before the schema confirms their shape and type would be unsafe.
 */
export function gateMedia(candidate: unknown, fallbackProviderId: string): GateResult {
  const parsed = mediaWithLicenseSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, rejection: { ...rejectionRefOf(candidate, fallbackProviderId), reason: "malformed" } };
  }
  if (!isUseAuthorized(parsed.data.license)) {
    return {
      ok: false,
      rejection: {
        providerId: parsed.data.providerId,
        providerMediaId: parsed.data.providerMediaId,
        reason: "unauthorized",
      },
    };
  }
  return { ok: true, media: parsed.data };
}
