import type { MediaWithLicense, PlaybackSource } from "@couch/contracts";

/**
 * What a provider declares it can do. A caller consults this before calling a method that
 * depends on it (`search`, or a `getPlayback` kind outside `playbackKinds`), rather than
 * calling speculatively and handling the `unsupported` error as normal control flow.
 */
export type ProviderCapabilities = {
  /** Whether `search` is implemented. When false, `search` throws a `"unsupported"` `ProviderError`. */
  readonly search: boolean;
  /** The `PlaybackSource["kind"]` values `getPlayback` can return. */
  readonly playbackKinds: readonly PlaybackSource["kind"][];
};

/** Options accepted by every `ContentProvider` method. */
export type ProviderRequestOptions = {
  /** Aborts the request. A provider implementation should honor it where the underlying call supports it. */
  readonly signal?: AbortSignal;
};

/**
 * A source of media. A provider is metadata and links only: it never hosts, copies, or
 * redistributes media, and it never returns an item without a license (the `MediaWithLicense`
 * type enforces this: there is no way to construct one without a `license` field).
 *
 * `capabilities` is declared, not inferred, and callers consult it before calling `search`
 * or before asking `getPlayback` for a kind outside `playbackKinds`. A method invoked outside
 * what `capabilities` declares throws a `ProviderError` with code `"unsupported"`, so callers
 * that skip the check still fail in a typed, catchable way instead of silently misbehaving.
 *
 * Every method may also throw `ProviderError` with `"not_found"` (no such item),
 * `"unavailable"` (the provider or its upstream could not answer), or `"invalid_response"`
 * (the provider answered, but the result could not be trusted, for example media without a
 * license).
 */
export interface ContentProvider {
  /** Stable slug identifying this provider, matching `MediaWithLicense["providerId"]`. */
  readonly id: string;
  /** Human-readable name for UI. */
  readonly displayName: string;
  /** What this provider supports. Callers consult it instead of calling speculatively. */
  readonly capabilities: ProviderCapabilities;

  /** The provider's default listing of media, each carrying a license. */
  list(options?: ProviderRequestOptions): Promise<MediaWithLicense[]>;

  /**
   * Media matching `query`. Throws `ProviderError` with code `"unsupported"` when
   * `capabilities.search` is false.
   */
  search(query: string, options?: ProviderRequestOptions): Promise<MediaWithLicense[]>;

  /** The full record for one item. Throws `ProviderError` with code `"not_found"` when it does not exist. */
  getDetails(providerMediaId: string, options?: ProviderRequestOptions): Promise<MediaWithLicense>;

  /**
   * A resolved way to play one item. Throws `ProviderError` with code `"unsupported"` when
   * the provider cannot produce a kind declared in `capabilities.playbackKinds`, and with
   * code `"not_found"` when the item does not exist.
   */
  getPlayback(providerMediaId: string, options?: ProviderRequestOptions): Promise<PlaybackSource>;
}
