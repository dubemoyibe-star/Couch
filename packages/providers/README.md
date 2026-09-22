# @couch/providers

The content provider layer: metadata and links only. This package defines the
`ContentProvider` interface, the capability model, and `ProviderError`. It contains no
registry, no license gate, no real provider, and no network code.

## The rule

A provider must never return media without a license. This is not just a convention: the
`MediaWithLicense` type from `@couch/contracts` has no way to construct a value without a
`license` field, so a provider that tries to skip it fails to typecheck, not just to pass
review.

## Writing a provider

Implement `ContentProvider`:

```ts
import type { ContentProvider } from "@couch/providers";

export class MyProvider implements ContentProvider {
  readonly id = "my-provider";
  readonly displayName = "My Provider";
  readonly capabilities = { search: true, playbackKinds: ["hls"] } as const;

  async list(options) { /* ... */ }
  async search(query, options) { /* ... */ }
  async getDetails(providerMediaId, options) { /* ... */ }
  async getPlayback(providerMediaId, options) { /* ... */ }
}
```

- `capabilities` is declared, not inferred. A caller checks `capabilities.search` before
  calling `search`, and checks `capabilities.playbackKinds` before expecting a given
  `PlaybackSource["kind"]` from `getPlayback`.
- Calling an unsupported method throws `ProviderError` with code `"unsupported"`. A provider
  that does not implement a capability should still throw this error itself, in case a
  caller invokes it without checking `capabilities` first.
- Every method may also throw `ProviderError` with code `"not_found"` (no such item),
  `"unavailable"` (the provider or its upstream could not answer), or `"invalid_response"`
  (the provider answered, but the result could not be trusted).
- Use `isProviderError` to narrow a caught value to `ProviderError` before reading `code` or
  `providerId`.
- Honor `options?.signal` where the underlying call supports cancellation.

## Licensing basis, not availability

Every item a provider returns needs a documented licensing basis: who verified it, against
what source, and on what date. "It is available online" is never a reason to include an
item. See `docs/LICENSING.md` for how a license is verified and recorded.

## Out of scope for this package

- A registry that selects among providers.
- The license gate that decides whether an item is actually shown (see `@couch/shared`'s
  `isUseAuthorized`).
- Any real provider implementation or network code.
