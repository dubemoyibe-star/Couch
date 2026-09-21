import * as z from "zod";

/**
 * Field limits for media, license and playback source data. String lengths are in Unicode
 * code points, which is how Zod measures them, so an emoji counts as 1 and not as the 2 that
 * `string.length` reports. A combining mark or a ZWJ sequence is several code points. These
 * are field limits, not byte sizes: a message is held to a size cap in bytes, and a code
 * point takes 1 to 4 bytes in UTF-8. Numeric bounds are inclusive.
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

/** True when `value` has an ASCII control character: U+0000 to U+001F or U+007F (DEL). */
function hasAsciiControl(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit <= 0x1f || unit === 0x7f) return true;
  }
  return false;
}

/**
 * A single-line label: trimmed, non-empty after trimming, at most `max` code points, and
 * free of ASCII control characters, newline and tab included. The control check runs on the
 * text as given, before trimming, so a tab or newline at the edge is rejected and not
 * silently trimmed away. Use it for names, which are shown on one line.
 */
export const singleLineText = (max: number) =>
  z
    .string()
    .refine((value) => !hasAsciiControl(value), {
      error: "text must not contain control characters",
    })
    .trim()
    .min(1)
    .max(max);

/**
 * An opaque id, up to `max` characters. It is checked and never changed: an id that is
 * trimmed or rewritten can stop matching the id the provider knows. So leading or trailing
 * whitespace is rejected instead of trimmed, and so is any ASCII control character
 * (U+0000 to U+001F and U+007F). Spaces inside the id are allowed.
 */
export const opaqueId = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value === value.trim(), {
      error: "id must not have leading or trailing whitespace",
    })
    .refine((value) => !hasAsciiControl(value), {
      error: "id must not contain control characters",
    });

const HTTPS_PREFIX =/^https:\/\//i;

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
