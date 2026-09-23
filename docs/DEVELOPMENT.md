# Development

## Database environments

The database is hosted Neon Postgres (Postgres 18). There is no local Postgres and no docker-compose.

| Environment | `COUCH_DB_ENV` | Where it lives | Env file |
| --- | --- | --- | --- |
| Production | `prod` | Neon `production` branch | none. Credentials exist only in the hosting provider's environment variables. |
| Development | `dev` | Neon `development` branch, default database | `.env.local` at the repo root |
| Test | `test` | A separate database named `testing` inside the `development` branch | `.env.test` at the repo root |

**Never put production credentials in a local file.** `.env.local` and `.env.test` hold development and test values only. Every `.env` and `.env.*` file except `.env.example` is gitignored.

### Create the `testing` database

In the Neon Console: open the project, choose the `development` branch, open its **Databases** tab, click **New database**, and name it exactly `testing`. Pick the same owner role as the default database.

### Get the connection strings

In the Neon Console, click **Connect**, choose the `development` branch, then pick the database (the default one for dev, `testing` for test) and the role. Copy two strings for each:

- **Pooled**: the **Connection pooling** toggle on. The host contains `-pooler`. This is `DATABASE_URL`, used by the runtime client.
- **Direct**: the toggle off. Same host without `-pooler`. This is `DIRECT_URL`, used by the Prisma CLI. Migrations must not go through the pooler.

Copy `.env.example` to `.env.local` and fill it with the dev strings and `COUCH_DB_ENV=dev`. Make `.env.test` the same way with the `testing` strings and `COUCH_DB_ENV=test`. Neon shows `sslmode=require`. Use `sslmode=verify-full` instead: it is what the `pg` driver applies for `require` today, and naming it avoids a warning about a coming semantics change.

## How each tool picks its environment

Switching environment switches `DATABASE_URL`, `DIRECT_URL` and `COUCH_DB_ENV` together, because they come from one file. Values in the chosen file replace values already exported in the shell.

| Tool | Reads | Selected by |
| --- | --- | --- |
| Prisma CLI (`db:*` scripts) | `.env.local` | default `prisma.config.ts` |
| Prisma CLI (`db:*:test` scripts) | `.env.test` | `--config prisma.test.config.ts` |
| Next.js (`next dev`) | `.env.local` at the repo root | `apps/web/next.config.ts`. Next itself only reads files inside `apps/web`, and skips `.env.local` when `NODE_ENV=test`. |
| `pnpm test` (unit tests) | no env file | `packages/database/vitest.config.ts` |
| `pnpm test:db` (database tests) | `.env.test` | `packages/database/vitest.db.config.ts` global setup |

The Prisma CLI does not load dotenv files by itself, so `prisma.config.ts` loads the file before doing anything else. Production builds and servers read no local file.

A fresh clone needs no env file and no database variable to install, type check, lint, run `pnpm test`, or build `@couch/web`. `pnpm install` runs `prisma generate`, which needs no database. Only `pnpm test:db` and the `db:*` scripts need env values.

## Tests

Tests that touch a database are named `*.db.test.ts`. Every other test is a unit test.

| Command | Runs | Needs |
| --- | --- | --- |
| `pnpm test` | Every test except `*.db.test.ts` | Nothing. No database, no env file. |
| `pnpm test:db` | Only `*.db.test.ts` | `.env.test` with `COUCH_DB_ENV=test` and both URLs naming the database `testing` |

`pnpm test:db` runs `test:db` in every package that defines it (`pnpm -r`). In `packages/database` it uses `vitest.db.config.ts`, which:

- loads `.env.test` and runs the `COUCH_DB_ENV` guard once, before any test file. If the file is missing or the guard refuses, the run stops with a message naming the rule and the variable, and exits non-zero. It never skips silently, and an empty match is a failure, not a pass.
- runs test files one at a time, because they share one database.

Every database suite also starts with `assertDatabaseEnv(process.env, "test-suite")`, so a suite refuses to run even if it is started some other way.

A database test creates its own data with values unique to the run (for example a random email) and removes it in its teardown, so the `testing` database is empty between runs. `packages/database/src/user.db.test.ts` is the reference example. The unit tests for the guard itself, in `env-guard.test.ts`, run under `pnpm test`.

CI runs both `pnpm test` and `pnpm test:db`.

**Known flakiness**: `pnpm test:db` (both locally and in CI) has occasionally hit a connection timeout against Neon on longer runs, most likely the compute-wake delay described under [Client and IDs](#client-and-ids) compounding across a long sequence of database tests rather than a single first connection. Neither the CI workflow's `pnpm test:db` step nor `vitest.db.config.ts` currently retries a failed run. If this recurs in CI, re-running the job is the immediate fix; if it becomes frequent, consider a workflow-level retry (for example `nick-fields/retry`) around that one step rather than adding retry logic to the test suites themselves.

## AI agents and destructive Prisma commands

Prisma Migrate has a built-in safeguard: when it detects that it was started by an AI agent, it refuses destructive commands such as `migrate reset` unless the `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` environment variable is set, which is meant to record the user's explicit consent. An agent that hits this refusal must stop and ask the maintainer. It must never set that variable itself, and the maintainer's consent applies to that one action only. The `COUCH_DB_ENV` guard applies as well and is not replaced by the safeguard.

## Migrations

Run these from the repo root. The scripts belong to `@couch/database`.

| Goal | Command |
| --- | --- |
| Generate the client | `pnpm --filter @couch/database db:generate` (also runs on install) |
| Create and apply a migration on dev | `pnpm --filter @couch/database db:migrate --name <name>` |
| Apply existing migrations on dev | `pnpm --filter @couch/database db:migrate:deploy` |
| Apply existing migrations on test | `pnpm --filter @couch/database db:migrate:deploy:test` |
| Reset dev (drops all data, re-applies migrations) | `pnpm --filter @couch/database db:reset` |
| Reset test | `pnpm --filter @couch/database db:reset:test` |
| Production | The hosting provider's deploy step runs `db:migrate:deploy` with the provider's environment variables and no env file. |

The generated client is written to `packages/database/src/generated` and is not committed.

## The `COUCH_DB_ENV` guard

`assertDatabaseEnv` in `packages/database/src/env-guard.ts` is a pure function: it takes the environment values and does no I/O. The Prisma config runs it for every Prisma command that can reach a database, including a `prisma` command typed by hand. Offline commands (`generate`, `validate`, `format`, `version`, help) skip it.

It refuses to continue unless all of these hold:

1. `COUCH_DB_ENV` is exactly `dev`, `test` or `prod`. Unset or any other value is refused.
2. The operation is allowed for that environment:
   - reset, `migrate dev`, `db push` and any other command that can rewrite data: `dev` and `test` only.
   - `migrate deploy`: `dev`, `test` and `prod`.
   - test suites that touch the database: `test` only.
3. `DATABASE_URL` and `DIRECT_URL` both parse as postgres URLs that name a database.
4. The database name does not depend on `COUCH_DB_ENV` being right. With `test`, both URLs must name a database called exactly `testing`. With `dev` or `prod`, neither may.
5. Both URLs point at the same endpoint and database. Hosts are compared after removing a `-pooler` suffix from the first host label. This catches a pooled URL for one database next to a direct URL for another.

Failure messages name the rule and the variable. They never include a URL, host, user or password.

A test suite that touches the database (a `*.db.test.ts` file, see [Tests](#tests)) must start with `assertDatabaseEnv(process.env, "test-suite")`, exported from `@couch/database`.

## Client and IDs

- **Driver**: the client uses `@prisma/adapter-pg`, the standard `pg` driver over TCP. It connects to Neon through the pooled URL and works the same against any plain Postgres server, so CI can use a Postgres service container. `@prisma/adapter-neon` uses Neon's HTTP and WebSocket protocol and would not.
- **Exports**: `createPrismaClient({ connectionString })` builds a client. `getPrismaClient()` returns one shared instance kept on `globalThis`, so Next.js hot reload does not open a new pool on every reload. It reads `DATABASE_URL` on first use.
- **First connection**: Neon computes scale to zero and can take a few seconds to wake. The `pg` driver waits forever by default, so the factory sets `connectionTimeoutMillis` to 15 seconds. The database Vitest config (`vitest.db.config.ts`) sets 30 second test and hook timeouts for the same reason. A failed first connect can simply be retried.
- **IDs**: every model uses `String @id @default(uuid(7))`. Prisma generates the value. The Prisma docs do not name a recommended generator, so this is a choice: UUIDv7 values are time-ordered, so inserts stay at the end of the primary key index, and they are opaque, so ids do not reveal row counts. Use the same declaration on every new model.

## Authentication

Sign-in is handled by Better Auth (`apps/web/src/lib/auth.ts`), using its Prisma adapter (`better-auth/adapters/prisma`) against the same shared Prisma client `@couch/database` already exports (`getPrismaClient()`). Using the shared client, instead of a second `PrismaClient`, keeps auth queries on the same connection pool, the same `DATABASE_URL`, and the same `COUCH_DB_ENV` guard as the rest of the app.

`auth.ts` exports `getAuth()`, not a module-scope `auth` instance: building the Better Auth instance calls `getPrismaClient()`, which reads `DATABASE_URL`, so building it eagerly at import time would make every module that (even indirectly) imports `auth.ts` require a live database, including during `next build`'s page-data collection. `getAuth()` defers that construction to first call, the same lazy-singleton pattern `getPrismaClient()` itself uses.

**Schema reconciliation**: Better Auth's Prisma adapter conventionally expects a `name` field on the user model. The existing `User` model already has `displayName`, and adding a second `name` field would leave two overlapping name fields. Instead, `auth.ts` configures the adapter with `user: { fields: { name: "displayName" } }`, which points the adapter's `name` concept at the existing `displayName` column. The adapter's own field name in code stays `name` (visible in a Better Auth session's `user.name`); the database column and the rest of the app keep `displayName`. The existing id strategy (`uuid(7)`) and the unique `email` constraint are unchanged. `User.emailVerified` was added because the adapter requires it; it defaults to `false` and stays that way, since email verification is not sent or enforced in this MVP.

`Session` and `Account` cascade-delete with their `User` (`onDelete: Cascade`), matching Better Auth's documented schema. `Verification` has no foreign key: Better Auth looks up a verification row by `identifier`.

`emailAndPassword` is enabled with `requireEmailVerification: false`, so sign-in works without a verification step. Better Auth enforces a default minimum password length of 8 characters (and a default maximum of 128), which this setup leaves unchanged.

Env vars: `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`) and `BETTER_AUTH_URL` (the app's own base URL). Add real values to `.env.local` and `.env.test`; `.env.example` has placeholders only.

`apps/web/src/lib/session.ts` exports `getCurrentUser()`, which reads the session for the current request through `getAuth().api.getSession`. Later pages and route handlers should call it instead of reimplementing session lookup. It reads `headers()` before calling `getAuth()`, not after: `headers()` is what tells Next a route depends on the current request and must render dynamically rather than being prerendered at build time, so that bailout needs to happen before any database-backed code runs.
