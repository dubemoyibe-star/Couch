import * as z from "zod";

/**
 * Field limits for media, license and playback source data. Lengths are in UTF-16 code
 * units (what `string.length` reports). Numeric bounds are inclusive.
 */
export const MEDIA_LIMITS = {
  /** Provider slug, for example `my-provider`. */
  providerId: 64,
  /** Provider-side media id. Opaque, so it gets generous room. */
  providerMediaId: 256,
  /** Internal catalog id. */
  catalogId: 128,
  title: 200,
  description: 5000,
  /** License name as published by the licensor. */
  licenseName: 200,
  licenseVersion: 32,
  rightsholder: 300,
  attribution: 1000,
  additionalRestrictions: 2000,
  verificationNotes: 2000,
  /** Every url field. 2048 is the de facto ceiling browsers and CDNs agree on. */
  url: 2048,
  /**
   * Sanity range for `releaseYear`. It only rejects garbage. The upper bound is not the
   * current year on purpose: contracts has no clock, so "not in the future" is not checked.
   */
  releaseYearMin: 1800,
  releaseYearMax: 2100,
} as const;

/** A trimmed string with at least one character after trimming, up to `max`. */
export const trimmedText = (max: number) => z.string().trim().min(1).max(max);

const HTTPS_PREFIX = /^https:\/\//i;

/**
 * The authority (host, and any userinfo) of a URL that starts with `https://`. The URL
 * parser treats `/` and `\` alike and skips any number of them after the scheme, so this
 * does too. The authority ends at the first `/`, `\`, `?` or `#`.
 */
function authorityOf(url: string): string {
  return url.replace(/^https:[/\\]*/i, "").split(/[/\\?#]/, 1)[0] ?? "";
}

/**
 * An `https` URL with no embedded credentials.
 *
 * Zod's `z.url` restricts the protocol (`httpUrl` would also allow plain `http`) but has
 * no option for userinfo, so credentials are rejected by the refinement below. It looks
 * for `@` in the authority, where userinfo has to be. An `@` in the path, query or
 * fragment is legitimate and passes.
 *
 * The value must literally start with `https://`. That closes two gaps: the URL parser
 * accepts `https:host` and silently drops leading control characters, and either could
 * otherwise hide userinfo from the authority check.
 */
export const httpsUrl = z
  .url({ protocol: /^https$/ })
  .max(MEDIA_LIMITS.url)
  .refine((value) => HTTPS_PREFIX.test(value), { error: "URL must start with https://" })
  .refine((value) => !authorityOf(value).includes("@"), {
    error: "URL must not contain credentials",
  });
