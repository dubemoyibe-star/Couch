# Static catalog

JSON manifest files loaded by `StaticProvider` (`@couch/providers`). This directory ships
empty except for this file: it contains no real content entries. Adding one is a manual,
human step, never an automated or scripted one.

## Format

Add a `*.json` file here. Its contents are either one entry object or an array of entry
objects. Each entry is validated at load time against the contracts ingest schema: a
`MediaWithLicense` (media fields plus a `license` record) plus a `playback` field (a
`PlaybackSource`). Unknown keys are rejected, at every level.

```json
{
  "providerId": "static",
  "providerMediaId": "some-stable-id",
  "title": "...",
  "description": "...",
  "durationSeconds": 5400,
  "posterUrl": "https://...",
  "releaseYear": 1999,
  "license": {
    "licenseName": "...",
    "licenseVersion": "...",
    "licenseUrl": "https://...",
    "sourceUrl": "https://...",
    "rightsholder": "...",
    "attributionRequired": true,
    "attribution": "...",
    "intendedUseAllowed": true,
    "commercialUseAllowed": false,
    "additionalRestrictions": null,
    "verifiedAt": "2026-01-01",
    "verificationNotes": null
  },
  "playback": {
    "kind": "mp4",
    "url": "https://..."
  }
}
```

## The rule for every field under `license`

Every value under `license` comes from a human who opened `sourceUrl` themselves, read the
license text at `licenseUrl`, and verified that it names this exact item. Nothing here is
guessed, inferred, or copied from a third-party listing. "It is available online" is never
a reason to add an entry. See [docs/LICENSING.md](../../../docs/LICENSING.md) for the full
verification procedure and the step-by-step checklist for adding an item.

In particular:

- `sourceUrl` and `verifiedAt` are mandatory. `sourceUrl` is the page where the human did the
  verification, not a search result or a third-party mirror. `verifiedAt` is the real date
  that happened.
- `intendedUseAllowed` answers one specific question: does the license, and the provider's
  own terms where they apply, allow synchronized remote viewing (several people in different
  places watching together, each through the provider's own authorized playback)? If that is
  unclear from the source, this is `false`.
- Loading a catalog file never checks authorization. An entry with `intendedUseAllowed:
  false` loads without error; the gated registry (`@couch/providers`'s
  `createProviderRegistry`) is what filters it out before it reaches a caller. Do not treat a
  successful load as a sign the item may be shown.

## What never goes here

- The media file itself. This directory holds metadata and a link (`playback.url`) only.
- A `playback.url` obtained by bypassing authentication, DRM, signatures, anti-bot measures,
  or a provider's terms. If the only way to get a working URL is to circumvent something,
  the item does not belong here.
- A guessed or inferred license field of any kind.

## Duplicates

Every entry's `providerMediaId` must be unique across every file in this directory. The
loader fails fast (throws) on a duplicate, a schema-invalid entry, or a file it cannot read.
