# @couch/database

Prisma and repositories over hosted Neon Postgres. Environments, migrations, the `COUCH_DB_ENV` guard and client details are in [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md).

## Tests

Tests that touch a database are named `*.db.test.ts`. All other tests are unit tests.

| Command | Runs | Needs |
| --- | --- | --- |
| `pnpm test` | Everything except `*.db.test.ts` | Nothing: no database, no env file |
| `pnpm test:db` | Only `*.db.test.ts` | `.env.test` at the repo root: `COUCH_DB_ENV=test`, and `DATABASE_URL` and `DIRECT_URL` naming the database `testing` |

Run them from the repo root (`pnpm test`, `pnpm test:db`) or from this package. CI runs both.

`pnpm test:db` uses `vitest.db.config.ts`. Its global setup loads `.env.test` and runs `assertDatabaseEnv(process.env, "test-suite")` before any test file. If the file is missing or the guard refuses, the run stops with a message and a non-zero exit code. It never skips silently, and a run that matches no files fails. Test files run one at a time.

A database test uses values unique to the run, such as a random email, and deletes its own rows in teardown, so `testing` stays empty. See `src/user.db.test.ts`. Every database suite starts with `assertDatabaseEnv(process.env, "test-suite")`.

## Catalog

See [docs/LICENSING.md](../../docs/LICENSING.md) for the licensing policy this catalog
enforces, including the rule that code outside this package must never query `Media` or
`LicenseRecord` directly.

The catalog is stored in two tables, `Media` and `LicenseRecord`, and read and written through the functions below. The client is always the first argument, and the types going in and out are the `@couch/contracts` types (`MediaWithLicense`, `CatalogMedia`).

**The rule: nothing unauthorized, malformed or inactive leaves the repository functions.** Every row that is read is mapped to `CatalogMedia`, checked with `isUseAuthorized` from `@couch/shared`, and validated with the strict `catalogMediaSchema`. A row that fails either check is excluded, even if it was written with plain SQL that skipped the repository. The queries also filter on `isActive` and on `license.intendedUseAllowed`, so most rejected rows are never fetched. The package exports no function that returns an unfiltered row and none that deletes media. `src/index.test.ts` asserts the export list.

The package still exports `PrismaClient`, so code that builds its own client can query any table. The catalog functions are the supported way to read media, and the guarantee above covers them.

### Model

- `LicenseRecord` has the fields of the contracts `LicenseRecord`. `verifiedAt` is a Postgres `date`.
- `Media` has a required, unique `licenseRecordId`, so a media row cannot exist without a license row and two media rows cannot share one. The database enforces both.
- `(providerId, providerMediaId)` is unique.
- Playback URLs are not stored. They are resolved through the provider at request time because they can expire.
- There is no hard delete of media. A takedown sets `isActive` to false. The license relation is `onDelete: Restrict`, so the database refuses to delete a license row that a media row still uses.

### Functions

| Function | What it does |
| --- | --- |
| `upsertCatalogMedia(db, media)` | Validates `media` with `mediaWithLicenseSchema`, then inserts or updates the media row and its license row in one transaction, keyed by `(providerId, providerMediaId)`. Calling it twice leaves one row of each kind, updated in place, with `isActive` true. Returns `CatalogMedia`, or `null` when the stored license does not allow the intended use. That item is stored, which is how a revoked license is recorded, but it is not handed back. |
| `deactivateMissing(db, providerId, keepProviderMediaIds)` | Sets `isActive` to false for that provider's active rows whose `providerMediaId` is not in the list, and returns how many it changed. Other providers are not touched. An empty list deactivates every active row of the provider. |
| `listCatalogMedia(db, { query?, limit, cursor?, onExcluded? })` | One page of gated media. Returns `{ items, nextCursor }`. |
| `getCatalogMedia(db, id, { onExcluded? }?)` | One item by internal id, or `null` when it does not exist or is excluded. |
| `MAX_CATALOG_PAGE_SIZE` | The largest `limit`, 100. A `limit` that is not an integer from 1 to this value throws a `RangeError`. |

`onExcluded` is called with `{ id, reason }` for each row that was fetched and then rejected. `reason` is `"unauthorized"` (the license does not pass `isUseAuthorized`, for example `attributionRequired` with no attribution), `"malformed"` (the schema rejected it, for example an `http` poster URL) or `"inactive"`. It never receives row contents. Rows the query already rules out, inactive rows and rows with `intendedUseAllowed` false, are not fetched and are not reported.

### Pagination

Order is title ascending, then id ascending. `cursor` is the id of the last row of the previous page, and `nextCursor` is that value for the next page, or `null` at the end.

A page can be shorter than `limit`, and can even be empty, because excluded rows are removed after they are fetched. `nextCursor` points at the last row that was fetched, kept or not, so the walk always moves forward. Callers follow `nextCursor` until it is `null` and never treat a short page as the last one.

The cursor row does not have to be in the catalog any more: a row that was deactivated between two page requests does not cause another row to be skipped. A cursor that matches no row throws a `RangeError`.

### Dates

`verifiedAt` is a calendar date with no time part. It is written as UTC midnight and read from the UTC date parts, so it comes back as exactly the `YYYY-MM-DD` string that went in, whatever time zone the process runs in. The date tests are meant to be run under different zones, for example `TZ=America/Los_Angeles` and `TZ=Pacific/Kiritimati`.

### Search

`query` matches a case-insensitive substring of the title. There is no full-text search. `%`, `_` and `\` are literal text: the client does not escape them in `contains`, so the repository escapes them before the query, and a query of `%` matches only titles that contain a percent sign.

### Test fixtures

Catalog database tests (`src/catalog.db.test.ts`) use a provider id prefix that is unique to each run and delete their own rows through `src/catalog-test-support.ts`. That helper deletes rows, so it is not exported from the package. Fixtures are obviously fake: titles start with `TEST FIXTURE` and URLs use `example.com`.

## Couch and membership

A couch is a watch party: `Couch` holds its durable identity, and `CouchMember` holds who belongs to it. Playback state (status, position, rate, revision) is NOT stored here: it is ephemeral, held in the realtime service's memory, and resets if that process restarts. The client is always the first argument, and every function returns the plain types below, never a Prisma model type. Expected domain failures come back as `{ ok: false, error }`; only unexpected failures (a connection error, for example) throw.

### Model

- `Couch`: `id`, `name`, `ownerId` (FK `User`, `onDelete: Restrict`: there is no user delete function), `inviteCode` (unique), `currentMediaId` (nullable FK `Media`, `onDelete: SetNull`), `createdAt`, `updatedAt`.
- `CouchMember`: `id`, `couchId` (FK `Couch`, `onDelete: Cascade`), `userId` (FK `User`, `onDelete: Restrict`), `role` (`HOST` or `PARTICIPANT`), `joinedAt`. `(couchId, userId)` is unique, and both columns are indexed.
- There is no delete function for users, couches or media in the MVP. See the schema comments on each relation for the reasoning behind its `onDelete` choice.
- The database role enum (`HOST` / `PARTICIPANT`) is mapped to the lowercase contract role (`"host"` / `"participant"`) at the repository boundary; nothing outside this package sees the database enum.

### `currentMediaId` can go stale

`Couch.currentMediaId` can point at media that has since become unavailable: a takedown deactivates a `Media` row (`isActive = false`) without deleting it, so the foreign key stays valid while the item is no longer part of the catalog. **Callers must always resolve `currentMediaId` through `getCatalogMedia` and treat a `null` result the same as a `null` currentMediaId.** `setCurrentMedia` enforces this at write time: a non-null `mediaId` must resolve through `getCatalogMedia` (authorized, active, well-formed) in the same transaction, or the write is refused with `media_unavailable`. This is the licensing rule enforced at write time; `null` always succeeds and clears the current media.

### Functions

| Function | What it does |
| --- | --- |
| `createCouch(db, { ownerId, name })` | Validates `name` with the contracts couch name rule, then creates the couch and the owner's `HOST` membership in one transaction: both rows exist together or not at all. Retries the invite code on a real unique collision (see below). |
| `getCouch(db, id)` | One couch by internal id, or `null`. |
| `getCouchByInviteCode(db, code)` | One couch by invite code, or `null`. |
| `joinCouch(db, { couchId, userId })` | Idempotent: an existing member, including the host, is returned unchanged and never downgraded, even when the couch is full. A new member is refused with `couch_full` once the couch already has `ROOM_MEMBERS_MAX` members (from `@couch/contracts`). Errors: `couch_not_found`, `couch_full`. |
| `leaveCouch(db, { couchId, userId })` | Removes the caller's own membership. The host cannot leave (host transfer is out of scope). Errors: `not_a_member`, `host_cannot_leave`. |
| `getMembership(db, { couchId, userId })` | One membership, or `null`. |
| `listMembers(db, couchId)` | Every member with `userId`, `displayName` (from `User`), `role`, `joinedAt`, ordered by `joinedAt` then `userId`. Online status is not stored: that is a realtime concern. |
| `removeMember(db, { couchId, actingUserId, targetUserId })` | Only a `HOST` may remove a member. The host cannot remove themselves. Errors: `forbidden` (actor is not the host), `cannot_remove_self`, `not_a_member` (target is not a member). |
| `setCurrentMedia(db, { couchId, actingUserId, mediaId })` | Only a `HOST` may call this. See "`currentMediaId` can go stale" above. Errors: `forbidden`, `media_unavailable`. |

### Joining atomically at the cap

`joinCouch` locks the couch row (`SELECT ... FOR UPDATE`, inside the same transaction as the membership count and insert) before it decides whether there is room. A second, concurrent join on the same couch blocks on that lock until the first transaction commits or rolls back, so the count it then reads already accounts for the first join's outcome. Two simultaneous joins therefore can never both observe room under the cap and both insert. `src/couch.db.test.ts` drives many simultaneous joins at the cap and checks that exactly the free slots succeed.

### Invite codes

Invite codes are generated server-side in this package (`src/invite-code.ts`), with Node's `crypto.randomInt`, never in `@couch/shared` (which has no Node dependency).

- **Alphabet**: 31 lowercase, URL-safe characters: digits `2`-`9` and `a`-`z` minus `i`, `l`, `o`. `0`/`o` and `1`/`l`/`i` are excluded because they are commonly confused with each other.
- **Length**: 17 characters. Entropy is `length * log2(alphabet size)`; `log2(31)` is about 4.954 bits per character, so 17 characters give about 84.2 bits, above the 80-bit floor this package requires.
- **Uniformity**: `randomInt` rejection-samples, so every character of the alphabet is equally likely; a plain modulo of a random byte would be biased, because 31 does not divide 256.
- **Collision retry**: `createCouch` retries with a freshly generated code on a real unique-constraint collision, up to `MAX_INVITE_CODE_ATTEMPTS` (5) times. `withInviteCodeRetry` in `src/invite-code.ts` carries the retry loop, generator and collision check as parameters, so it is unit-testable (`src/invite-code.test.ts`) without a database. Exhausting every attempt rethrows the last collision error: an unexpected failure at that point, since the chance is astronomically small at 17 characters.

### Test fixtures

Couch database tests (`src/couch.db.test.ts`) create their own users, through `src/couch-test-support.ts`, and delete them (and anything they created) in teardown. That helper deletes rows, so it is not exported from the package. Fixtures are obviously fake: emails end in `@example.test` and couch names and display names start with `TEST FIXTURE`.

## Destructive commands and AI agents

Prisma Migrate refuses destructive commands such as `migrate reset` when it detects an AI agent, unless `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` is set. An agent must stop and ask the maintainer, and must never set that variable itself.
