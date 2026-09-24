# Licensing policy and repository media guard

This is Couch's licensing policy: the rule, the record every item must carry, how to add a
content item or a provider, attribution, takedown, and the direct-database-access rule that
keeps the license gate from being bypassed on reads. It is enforced by code, not just this
document: see [Enforcement](#enforcement) for what runs and what it checks.

## The rule

Couch never adds content because it is available online. Every media item needs a
documented licensing basis, verified by a human, at the level of the individual item, never
assumed from the platform, the provider, or another item that happens to look similar.
"It's on the same site as something we already checked" is not a licensing basis.

This is a hard requirement (see [CLAUDE.md](../CLAUDE.md)):

- License data is never invented or guessed. Every field comes from a human who opened the
  source, read the license, and verified it names this exact item.
- Media files are never committed. Only metadata and a link to the authorized host.
- No unofficial, reverse-engineered, scraped, or circumvention-based integration. No
  bypassing authentication, DRM, signatures, anti-bot measures, or a provider's terms.
- There is no bypass flag or environment variable that skips the license gate, and none may
  be added, on read or on write.

## The record: `LicenseRecord`

`LicenseRecord` is defined in `packages/contracts` (`licenseRecordSchema`) and stored as a
Prisma model in `packages/database`. The table below matches the schema exactly: field
names and semantics were diff-checked against `packages/contracts/src/index.ts` while
writing this document (see [Diff-check result](#diff-check-result)).

All fields are required. "Or null" means the key must still be present; a value is never
omitted, it is explicitly null.

| Field | Type | What it means | What a maintainer must verify |
| --- | --- | --- | --- |
| `licenseName` | string | The license's name as the licensor publishes it. | Copy it from the source, not from memory or a summary site. |
| `licenseVersion` | string or null | The published version. Null when a version does not apply. | Only set it if the licensor names a version. |
| `licenseUrl` | https URL | The license text on the licensor's own site. | Open it. It must be the actual license text, not a search result or a third-party summary. |
| `sourceUrl` | https URL | The page where the item and its license were verified. | This is the page you personally opened to do the verification, not a mirror or an aggregator. |
| `rightsholder` | string or null | The original creator or rightsholder, where available. | Record what the source states. Null if the source does not say. |
| `attributionRequired` | boolean | Whether credit must be shown. | Read the license terms, not just the license's reputation. |
| `attribution` | string or null | The credit text the UI shows. | Required (non-empty after trimming) whenever `attributionRequired` is true. Write the exact credit line the license or the source asks for. |
| `intendedUseAllowed` | boolean | Whether Couch's intended use is permitted: synchronized remote viewing through the provider's authorized playback. Couch never copies, hosts or redistributes the media. | Read the license AND the provider's own terms where they apply. If it is unclear, record `false`. |
| `commercialUseAllowed` | boolean | Whether the license allows commercial use in general. | Independent of `intendedUseAllowed`: an item can allow one and not the other. If unclear, record `false`. |
| `additionalRestrictions` | string or null | Any other restriction. | Null means you read the terms and found none. Null never means "not checked". |
| `verifiedAt` | `YYYY-MM-DD` | The calendar date of the last verification. | The real date the verification happened, not the date the manifest file was edited. |
| `verificationNotes` | string or null | Free-form notes from the verification. | Use it for anything future you (or another maintainer) would want to know: an ambiguous clause, why a field is what it is, and so on. |

`intendedUseAllowed` and `commercialUseAllowed` are independent questions and both are
stored, so a deployment whose commercial status changes can find every affected item. When
either is unclear, the recorded value is `false`. The schema records the verified answer; it
does not decide by itself whether an item may enter the catalog (that decision follows from
`isUseAuthorized` in `@couch/shared`, applied by the gate described in
[Enforcement](#enforcement)).

The `verifiedAt` date is not compared against today anywhere in the schema, because
`packages/contracts` has no clock. There is no automatic expiry. Re-verification is a
maintainer decision, not something the system does for you.

### Diff-check result

Checked against `packages/contracts/src/index.ts` (the `LicenseRecord` section) while
writing this document: no mismatch found. All twelve fields, their types, and their
nullability match the table above exactly.

## How to add a content item

This mirrors [packages/providers/catalog/README.md](../packages/providers/catalog/README.md)
step by step. If the two ever disagree, that README is the source of truth for the manifest
format; update this document to match.

1. Find the item on the provider's own site or through the provider's official API. Open the
   actual page (`sourceUrl`), not a search result, a cache, or a third-party mirror.
2. Read the license or terms that apply to that specific item. Follow the license link to
   the licensor's own text (`licenseUrl`).
3. Decide `intendedUseAllowed`: does the license, and the provider's own terms where they
   apply, allow synchronized remote viewing (several people in different places watching
   together, each through the provider's own authorized playback)? If that is unclear from
   the source, record `false`.
4. Decide `commercialUseAllowed` the same way, independently.
5. Fill in every other `LicenseRecord` field from what you actually read. Never guess or
   infer a value. `additionalRestrictions` is null only when you read the terms and found
   none.
6. Write (or add to) a `*.json` manifest file under `packages/providers/catalog/`: one entry
   object, or an array of entry objects, matching the ingest schema (`MediaWithLicense` plus
   a `playback` field). Unknown keys are rejected at every level.
7. The media file itself is never committed. The manifest holds metadata and a `playback.url`
   that points at the provider's own authorized playback (a page, an official embed, or an
   authorized stream/download link) — never a copy Couch hosts.
8. `providerMediaId` must be unique across every file in the catalog directory. The loader
   fails fast (throws), naming the file and entry, on a duplicate id, a schema-invalid entry,
   a `providerId` mismatch, or a file it cannot read.
9. Run the catalog sync: `pnpm --filter @couch/web sync:catalog` (or `sync:catalog:test`
   against the test database). This is `apps/web/scripts/sync-catalog.ts`, and it is what
   actually brings a verified manifest entry into the database catalog. Loading a manifest
   file never checks authorization by itself; the gated provider registry does that during
   sync, and an entry with `intendedUseAllowed: false` is filtered out there, not at load
   time.
10. Confirm the item appears (or, for a deliberately unauthorized entry, does not appear) by
    calling `listCatalogMedia`.

## How to add a provider

1. Read the provider's actual terms of service and API/embed documentation yourself before
   writing any code. Record what you checked (URL, date, what it said about redistribution,
   embedding, and synchronized playback) in the provider's own documentation or commit
   message.
2. Prefer, in order: an official API, an official embed, or explicitly licensed
   downloadable/streamable media. Do not build against an interface the provider does not
   document or support.
3. Never scrape in violation of a provider's terms. Never build an unofficial or
   reverse-engineered integration. Never bypass authentication, DRM, signatures, access
   controls, or anti-bot measures, for any reason, including "just to test it."
4. Implement `ContentProvider` from `@couch/providers` (see that package's README). A
   provider returns `MediaWithLicense`; the type has no way to construct a value without a
   `license` field, so an implementation that tries to skip it fails to typecheck.
5. A provider does not decide whether an item is shown. That is the gated registry's job
   (`createProviderRegistry` in `@couch/providers`, using `isUseAuthorized` from
   `@couch/shared`). A provider returning an item with `intendedUseAllowed: false` is
   expected and handled, not an error.

## Attribution

When a catalog item's `attributionRequired` is true, its exact `attribution` text is shown on the
item's details page, in the credit line beneath the description, together with the license name and
links to the license and the source. Browse tiles in the catalog list show only the poster, title and
year. Any other screen that presents an item as content in its own right, rather than as a link to
its details page, must show the attribution too. `attribution` is carried through to
`CatalogMedia` (`packages/contracts`), so it is available on the wire wherever an item is displayed.

## Takedown procedure

1. In the manifest under `packages/providers/catalog/`, either remove the entry, update it,
   or set `license.intendedUseAllowed` to `false`.
2. Run the catalog sync (`pnpm --filter @couch/web sync:catalog`), the same command used to
   add an item.
3. Confirm the item is gone by calling `listCatalogMedia` (directly, or through
   `getCatalogMedia` for that item's id): it should no longer be returned.

The underlying database row is deactivated (`isActive = false`), not deleted. This is by
design (see `packages/database/README.md` and the Issue 13 finding): there is no hard delete
of media, so a takedown is reversible and auditable, but the item is unreachable through
every catalog read the moment `isActive` is false or `intendedUseAllowed` is false, whichever
the sync applied.

## Direct database access rule

Application code outside `packages/database` must never query the `Media` or
`LicenseRecord` Prisma delegates directly (`db.media.*`, `db.licenseRecord.*`, or the
equivalent on any other Prisma client variable). It must go through
`packages/database`'s catalog functions (`upsertCatalogMedia`, `listCatalogMedia`,
`getCatalogMedia`, `deactivateMissing`, `countMissing`), because those functions are the
only place the license gate is enforced on reads: every row they return is checked with
`isUseAuthorized` and validated against the strict `catalogMediaSchema` before it leaves the
package (see `packages/database/README.md`, "Catalog"). A direct query bypasses that check
entirely, and would return unauthorized, inactive, or malformed rows to a caller with no
warning.

This is enforced, not just documented: `scripts/check-no-direct-media-access.mjs`
(`pnpm check:no-direct-db-access`) scans every source file outside `packages/database` for
this pattern and fails the check if it finds one. See [Enforcement](#enforcement).

There is no bypass of the license gate, on read or on write. This mirrors the write side:
`upsertCatalogMedia` stores whatever it is given (which is how a revoked license gets
recorded), but hands back `null` instead of the row when the stored license does not allow
the intended use, so a caller can never receive a row it should not act on.

## Enforcement

Two automated checks back this policy, both plain Node scripts with no dependencies, run
from the repo root:

- **`pnpm check:no-media`** (`scripts/check-no-media.mjs`) fails if a file that looks like a
  committed media file is present: a known audio/video container or segment extension, or
  any file over 5 MB. A small, explicit allowlist (`scripts/media-guard-allowlist.txt`) is
  the only way to exempt a specific, reviewed path; there is no way to exempt the check
  itself. `.gitignore` also lists common media extensions as a first line of defense, but the
  check is what is actually enforced.
- **`pnpm check:no-direct-db-access`** (`scripts/check-no-direct-media-access.mjs`) fails if
  any file outside `packages/database` contains what looks like a direct Prisma access to
  `.media` or `.licenseRecord`. See [Direct database access rule](#direct-database-access-rule)
  above for what it looks for and why an ambiguous match still fails the check.

Both checks are wired into `pnpm check:no-media` / `pnpm check:no-direct-db-access` today.
CI wiring is tracked as a separate, later issue.
