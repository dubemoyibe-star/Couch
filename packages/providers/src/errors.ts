/**
 * Stable error codes a provider can raise. Add new codes here; never rename or remove one.
 *
 * - `not_found`: the requested media does not exist on the provider.
 * - `unsupported`: the provider does not implement the requested capability.
 * - `unavailable`: the provider (or the upstream it depends on) could not answer right now.
 * - `invalid_response`: the provider answered, but the response could not be trusted or
 *   parsed (for example it does not carry a license, or fails the contracts schema).
 */
export const PROVIDER_ERROR_CODES = [
  "not_found",
  "unsupported",
  "unavailable",
  "invalid_response",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

/**
 * Raised by a `ContentProvider` for any expected failure. Every instance carries a stable
 * `code` from `PROVIDER_ERROR_CODES` and the `providerId` that raised it, so a caller can
 * react to the failure kind without string-matching `message`.
 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly providerId: string;

  constructor(code: ProviderErrorCode, providerId: string, message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.providerId = providerId;
  }
}

/** True when `error` is a `ProviderError`. Narrows the type so `code` and `providerId` are readable. */
export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}
