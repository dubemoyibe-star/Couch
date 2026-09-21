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

## Destructive commands and AI agents

Prisma Migrate refuses destructive commands such as `migrate reset` when it detects an AI agent, unless `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` is set. An agent must stop and ask the maintainer, and must never set that variable itself.
