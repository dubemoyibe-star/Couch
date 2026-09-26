# Development

## Database environments

The database is hosted Neon Postgres (Postgres 18). There is no local Postgres and no docker-compose.

| Environment | `COUCH_DB_ENV` | Where it lives                                                      | Env file                                                                      |
| ----------- | -------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Production  | `prod`         | Neon `production` branch                                            | none. Credentials exist only in the hosting provider's environment variables. |
| Development | `dev`          | Neon `development` branch, default database                         | `.env.local` at the repo root                                                 |
| Test        | `test`         | A separate database named `testing` inside the `development` branch | `.env.test` at the repo root                                                  |

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

| Tool                             | Reads                                        | Selected by                                                                                                                                                                                 |
| -------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma CLI (`db:*` scripts)      | `.env.local`                                 | default `prisma.config.ts`                                                                                                                                                                  |
| Prisma CLI (`db:*:test` scripts) | `.env.test`                                  | `--config prisma.test.config.ts`                                                                                                                                                            |
| Next.js (`next dev`)             | `.env.local` at the repo root                | `apps/web/next.config.ts`. Next itself only reads files inside `apps/web`, and skips `.env.local` when `NODE_ENV=test`.                                                                     |
| `apps/realtime` process          | `.env.local` or `.env.test` at the repo root | its entry point calls `loadRealtimeEnv("local" or "test")` before anything reads the environment, using the same `loadEnvFile` as the Prisma configs. Not Next.js, so no automatic loading. |
| `pnpm test` (unit tests)         | no env file                                  | `packages/database/vitest.config.ts`                                                                                                                                                        |
| `pnpm test:db` (database tests)  | `.env.test`                                  | `packages/database/vitest.db.config.ts` global setup                                                                                                                                        |

The Prisma CLI does not load dotenv files by itself, so `prisma.config.ts` loads the file before doing anything else. Production builds and servers read no local file.

A fresh clone needs no env file and no database variable to install, type check, lint, run `pnpm test`, or build `@couch/web`. `pnpm install` runs `prisma generate`, which needs no database. Only `pnpm test:db` and the `db:*` scripts need env values.

## Tests

Tests that touch a database are named `*.db.test.ts`. Every other test is a unit test.

| Command        | Runs                             | Needs                                                                            |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm test`    | Every test except `*.db.test.ts` | Nothing. No database, no env file.                                               |
| `pnpm test:db` | Only `*.db.test.ts`              | `.env.test` with `COUCH_DB_ENV=test` and both URLs naming the database `testing` |

`pnpm test:db` runs `test:db` in every package that defines it (`pnpm -r`). In `packages/database` it uses `vitest.db.config.ts`, which:

- loads `.env.test` and runs the `COUCH_DB_ENV` guard once, before any test file. If the file is missing or the guard refuses, the run stops with a message naming the rule and the variable, and exits non-zero. It never skips silently, and an empty match is a failure, not a pass.
- runs test files one at a time, because they share one database.

Every database suite also starts with `assertDatabaseEnv(process.env, "test-suite")`, so a suite refuses to run even if it is started some other way.

A database test creates its own data with values unique to the run (for example a random email) and removes it in its teardown, so the `testing` database is empty between runs. `packages/database/src/user.db.test.ts` is the reference example. The unit tests for the guard itself, in `env-guard.test.ts`, run under `pnpm test`.

CI runs both `pnpm test` and `pnpm test:db`.

**Known flakiness (local runs only)**: run locally, `pnpm test:db` reads `.env.test` and so talks to the real Neon `testing` database. It has occasionally hit a connection timeout or DNS failure on longer runs, most likely the compute-wake delay described under [Client and IDs](#client-and-ids) compounding across a long sequence of database tests rather than a single first connection. `vitest.db.config.ts` does not currently retry a failed run; re-running locally is the immediate fix.

CI does not hit Neon at all: its `pnpm test:db` step runs against the `postgres:18` service container defined in `.github/workflows/ci.yml`, a plain local Postgres with no cold-start delay, so this specific flakiness is not expected there. If CI's `pnpm test:db` step becomes flaky for some other reason, that would be a different problem worth investigating on its own, not assumed to be this one.

## AI agents and destructive Prisma commands

Prisma Migrate has a built-in safeguard: when it detects that it was started by an AI agent, it refuses destructive commands such as `migrate reset` unless the `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` environment variable is set, which is meant to record the user's explicit consent. An agent that hits this refusal must stop and ask the maintainer. It must never set that variable itself, and the maintainer's consent applies to that one action only. The `COUCH_DB_ENV` guard applies as well and is not replaced by the safeguard.

## Migrations

Run these from the repo root. The scripts belong to `@couch/database`.

| Goal                                              | Command                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Generate the client                               | `pnpm --filter @couch/database db:generate` (also runs on install)                                                     |
| Create and apply a migration on dev               | `pnpm --filter @couch/database db:migrate --name <name>`                                                               |
| Apply existing migrations on dev                  | `pnpm --filter @couch/database db:migrate:deploy`                                                                      |
| Apply existing migrations on test                 | `pnpm --filter @couch/database db:migrate:deploy:test`                                                                 |
| Reset dev (drops all data, re-applies migrations) | `pnpm --filter @couch/database db:reset`                                                                               |
| Reset test                                        | `pnpm --filter @couch/database db:reset:test`                                                                          |
| Production                                        | The hosting provider's deploy step runs `db:migrate:deploy` with the provider's environment variables and no env file. |

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

### Shared core and apps/realtime

The database adapter, secret, base URL, session and cookie settings, trusted origins and the `name` field mapping come from `createAuthCoreOptions()` (`@couch/database/auth-core`, see [ARCHITECTURE.md](ARCHITECTURE.md)), which `apps/web/src/lib/auth.ts` spreads into its own `betterAuth()` call. The core refuses to build when `BETTER_AUTH_SECRET` or `BETTER_AUTH_URL` is missing, so a process never falls back to Better Auth's built-in default secret. `apps/realtime/src/lib/auth.ts` builds its own instance from the same core with nothing else, and only calls `auth.api.getSession({ headers })`. `getSession` is not Next.js specific: it needs a `Headers` object carrying the session cookie, and returns `null` when there is no valid session. Both processes must use the same `BETTER_AUTH_SECRET` (it signs the cookie) and the same `BETTER_AUTH_URL` (an https URL gives the cookie a `__Secure-` name prefix, so a different scheme means a different cookie name).

`apps/realtime` needs `DATABASE_URL`, `DIRECT_URL`, `COUCH_DB_ENV`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `REALTIME_INTERNAL_SECRET` (shared with `apps/web`, generate with `openssl rand -base64 32`). It does not need `RESEND_API_KEY` or the Google variables. Its auth instance and Prisma client are built on first use, never at import time.

## Realtime service

`apps/realtime` is a WebSocket server (`ws`, in `noServer` mode behind Node's `http` server). Run it with `pnpm --filter @couch/realtime dev` (watch) or `start`. It loads `.env.local` when present, and hosting providers inject the variables instead.

- **Port**: `PORT`, default `3001` (`apps/web` uses 3000).
- **Handshake**: the upgrade is checked before the WebSocket handshake completes, and a refused client gets a plain HTTP status. In order: the `Origin` header must be one of the shared auth core's trusted origins (`403`, and a missing `Origin` counts), then the session cookie must resolve to a session through `getSession` (`401` for a missing, forged, unsigned or expired session). `503` means the session lookup itself failed. A plain HTTP request that is not an upgrade gets `426`.
- **Identity**: the validated user id is attached to the connection at the upgrade and is the only identity for every message that connection sends. A message payload is never trusted for it.
- **Messages**: each text frame is parsed with `parseMessage` and `clientEvents`. A failure is answered with the contract's `error` message over the same connection, which stays open. Binary frames are answered with `invalid_json`. The socket refuses a frame over twice `MAX_CLIENT_MESSAGE_BYTES` and closes with code 1009, see the contracts README.
- **Shutdown**: `SIGTERM` and `SIGINT` stop accepting connections and close open ones with code 1001, then exit. A client that does not finish closing within 5 seconds is dropped.
- **Local run**: `pnpm --filter @couch/realtime dev` runs `tsx watch` and restarts on file changes. It reads `.env.local` (see [How each tool picks its environment](#how-each-tool-picks-its-environment)), so a fresh clone needs the same `.env.local` as `apps/web`, with `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` identical in both. Start `apps/web` on 3000 and this on 3001 in two terminals.
- **Manual check**: sign in through `apps/web` in a browser and copy the session cookie (`better-auth.session_token`, or `__Secure-better-auth.session_token` over https) from the browser's storage view. Then open a raw WebSocket with that cookie and an `Origin` equal to `BETTER_AUTH_URL`, from `apps/realtime`:
  -Replace <value> with your Better Auth session token.

```sh
node -e "const W=require('ws');const s=new W('ws://localhost:3001',{headers:{origin:'http://localhost:3000',cookie:process.argv[1]}});s.on('open',()=>{console.log('open');s.close()});s.on('unexpected-response',(_,r)=>console.log('refused',r.statusCode))" "better-auth.session_token=<value>"
```

`open` means the handshake passed. `refused 401` is a missing or invalid session, `refused 403` a wrong `Origin`.

- **Tests**: `pnpm test` runs the server against a real ws server and clients with a stand-in session lookup. `pnpm test:db` runs it again against real sessions in the `testing` database.
