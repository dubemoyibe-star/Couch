import type { MediaRef, MediaWithLicense, PlaybackSource } from "@couch/contracts";
import type { ContentProvider, ProviderCapabilities, ProviderRequestOptions } from "./content-provider";
import { ProviderError } from "./errors";
import { gateMedia, type MediaRejection } from "./gate";

/** Called once per candidate item the license gate rejected out of a `listMedia`/`searchMedia` call. */
export type OnRejected = (rejection: MediaRejection) => void;

/** One provider's failure during a `listMedia`/`searchMedia` call. Never carries item contents. */
export type ProviderFailure = {
  readonly providerId: string;
  readonly error: unknown;
};

/** Called once per provider that threw or timed out during a `listMedia`/`searchMedia` call. */
export type OnProviderError = (failure: ProviderFailure) => void;

/** A registered provider's public identity, for listing without exposing the instance itself. */
export type RegisteredProvider = {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
};

export type ProviderRegistryOptions = {
  /**
   * How long a single provider call may run before the registry treats it as failed, in
   * milliseconds. Default 10000 (10s): generous for a metadata call over a network, short
   * enough that one hung provider does not stall a request for an unreasonable time.
   */
  readonly timeoutMs?: number;
};

export type RegistryListOptions = ProviderRequestOptions & {
  readonly onRejected?: OnRejected;
  readonly onProviderError?: OnProviderError;
};

export type MediaListResult = {
  readonly items: MediaWithLicense[];
  /**
   * Ids of providers that answered this call without throwing or timing out, whether or not
   * they contributed any items. Lets a caller (such as a catalog sync) tell "this provider
   * has nothing" apart from "this provider failed", which `items` alone cannot.
   */
  readonly succeededProviderIds: string[];
};

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Runs `call` with a per-provider timeout. `call` receives an `AbortSignal` that combines
 * `outerSignal` (when given) and the timeout, so a well-behaved provider that honors
 * `options.signal` cancels its own work either way. A provider that ignores the signal is
 * still isolated: `Promise.race` returns control to the caller once the timeout elapses, so
 * one hung provider never blocks the others. The abandoned call is left to settle in the
 * background with its rejection swallowed, so it never surfaces as an unhandled rejection.
 *
 * IMPORTANT for real providers (out of scope here, no real provider exists yet): this only
 * stops the REGISTRY from waiting. It does not stop the provider's own call. A provider that
 * does not check `signal.aborted` or wire it into its underlying request (fetch, a driver, a
 * socket) keeps running after the timeout fires; the work, and whatever it costs (an open
 * connection, an in-flight request, quota) leaks until that call finishes on its own or
 * throws. Every real provider must honor `options.signal` on every underlying call it makes,
 * or a slow upstream turns into an unbounded number of abandoned in-flight requests.
 */
function callWithTimeout<T>(
  providerId: string,
  timeoutMs: number,
  outerSignal: AbortSignal | undefined,
  call: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(outerSignal?.reason);

  if (outerSignal) {
    if (outerSignal.aborted) controller.abort(outerSignal.reason);
    else outerSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new ProviderError(
        "unavailable",
        providerId,
        `provider timed out after ${timeoutMs}ms`,
      );
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  const settled = call(controller.signal);
  settled.catch(() => {
    // Prevented from becoming an unhandled rejection when the timeout wins the race below.
  });

  return Promise.race([settled, timeout]).finally(() => {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener("abort", forwardAbort);
  });
}

/**
 * Gates a batch of candidate items from one provider: accepted items go to `items`, each
 * rejection is reported through `onRejected`.
 */
function gateBatch(
  candidates: readonly unknown[],
  providerId: string,
  onRejected: OnRejected | undefined,
  items: MediaWithLicense[],
): void {
  for (const candidate of candidates) {
    const result = gateMedia(candidate, providerId);
    if (result.ok) items.push(result.media);
    else onRejected?.(result.rejection);
  }
}

/**
 * The gated provider registry. Every media object that reaches a caller, from any method,
 * has passed the license gate (`@couch/contracts`'s strict `MediaWithLicense` schema, then
 * `isUseAuthorized` from `@couch/shared`). There is no option, flag or exported path that
 * skips it.
 */
export type ProviderRegistry = {
  /** Every registered provider's id, display name and declared capabilities. */
  readonly providers: readonly RegisteredProvider[];

  /** Merges `list()` across every registered provider, gated. */
  listMedia(options?: RegistryListOptions): Promise<MediaListResult>;

  /** Merges `search(query)` across providers whose `capabilities.search` is true, gated. */
  searchMedia(query: string, options?: RegistryListOptions): Promise<MediaListResult>;

  /**
   * One item's full record, gated. Throws `ProviderError` with code `"not_found"` when no
   * provider is registered under `ref.providerId`, and whatever the provider itself throws
   * otherwise. Throws `ProviderError` with code `"license_rejected"` when the item fails the
   * gate.
   */
  getMedia(ref: MediaRef, options?: ProviderRequestOptions): Promise<MediaWithLicense>;

  /**
   * A resolved way to play one item. Resolves and gates the item's details FIRST (as
   * `getMedia` does, including its `"license_rejected"` throw), and only calls the
   * provider's `getPlayback` once that succeeds. This costs an extra provider call
   * (`getDetails` then `getPlayback`, instead of `getPlayback` alone) on every request, but
   * it is the only way to guarantee a provider that happily returns a playback URL for
   * unauthorized media can never have that URL leave the registry: the gate runs on the
   * item before the provider is ever asked for a URL, not on the URL itself.
   */
  getPlayback(ref: MediaRef, options?: ProviderRequestOptions): Promise<PlaybackSource>;
};

/**
 * Builds a `ProviderRegistry` over `providers`. Throws if two providers share an `id`.
 */
export function createProviderRegistry(
  providers: readonly ContentProvider[],
  options: ProviderRegistryOptions = {},
): ProviderRegistry {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const byId = new Map<string, ContentProvider>();
  for (const provider of providers) {
    if (byId.has(provider.id)) {
      throw new Error(`duplicate provider id "${provider.id}"`);
    }
    byId.set(provider.id, provider);
  }

  const registered: RegisteredProvider[] = [...byId.values()].map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    capabilities: provider.capabilities,
  }));

  function requireProvider(providerId: string): ContentProvider {
    const provider = byId.get(providerId);
    if (!provider) {
      throw new ProviderError("not_found", providerId, `no provider registered with id "${providerId}"`);
    }
    return provider;
  }

  /** Runs `call` against every provider in `candidates`, isolating failures and timeouts. */
  async function collectGated(
    candidates: readonly ContentProvider[],
    call: (provider: ContentProvider, signal: AbortSignal) => Promise<MediaWithLicense[]>,
    listOptions: RegistryListOptions | undefined,
  ): Promise<MediaListResult> {
    const items: MediaWithLicense[] = [];
    const succeededProviderIds: string[] = [];

    await Promise.all(
      candidates.map(async (provider) => {
        try {
          const raw = await callWithTimeout(provider.id, timeoutMs, listOptions?.signal, (signal) =>
            call(provider, signal),
          );
          gateBatch(raw, provider.id, listOptions?.onRejected, items);
          succeededProviderIds.push(provider.id);
        } catch (error) {
          listOptions?.onProviderError?.({ providerId: provider.id, error });
        }
      }),
    );

    return { items, succeededProviderIds };
  }

  function listMedia(listOptions?: RegistryListOptions): Promise<MediaListResult> {
    return collectGated([...byId.values()], (provider, signal) => provider.list({ signal }), listOptions);
  }

  function searchMedia(query: string, listOptions?: RegistryListOptions): Promise<MediaListResult> {
    const searchable = [...byId.values()].filter((provider) => provider.capabilities.search);
    return collectGated(
      searchable,
      (provider, signal) => provider.search(query, { signal }),
      listOptions,
    );
  }

  async function getMedia(
    ref: MediaRef,
    requestOptions?: ProviderRequestOptions,
  ): Promise<MediaWithLicense> {
    const provider = requireProvider(ref.providerId);
    const candidate = await callWithTimeout(provider.id, timeoutMs, requestOptions?.signal, (signal) =>
      provider.getDetails(ref.providerMediaId, { signal }),
    );
    const result = gateMedia(candidate, provider.id);
    if (!result.ok) {
      throw new ProviderError(
        "license_rejected",
        provider.id,
        `media ${ref.providerMediaId} was rejected by the license gate: ${result.rejection.reason}`,
      );
    }
    return result.media;
  }

  async function getPlayback(
    ref: MediaRef,
    requestOptions?: ProviderRequestOptions,
  ): Promise<PlaybackSource> {
    const provider = requireProvider(ref.providerId);
    // Runs getMedia's gate first. A ProviderError("license_rejected") thrown here propagates
    // as-is, and getPlayback is never called for media that did not pass the gate.
    await getMedia(ref, requestOptions);
    return callWithTimeout(provider.id, timeoutMs, requestOptions?.signal, (signal) =>
      provider.getPlayback(ref.providerMediaId, { signal }),
    );
  }

  return { providers: registered, listMedia, searchMedia, getMedia, getPlayback };
}
