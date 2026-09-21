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
| Prisma CLI (`db:*:test` scripts) | `.env.test` | `--config prisma.config.test.ts` |
| Next.js (`next dev`) | `.env.local` at the repo root | `apps/web/next.config.ts`. Next itself only reads files inside `apps/web`, and skips `.env.local` when `NODE_ENV=test`. |
| Vitest in `packages/database` | `.env.test` | `vitest.config.ts` setup file |

The Prisma CLI does not load dotenv files by itself, so `prisma.config.ts` loads the file before doing anything else. Production builds and servers read no local file.

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

A test suite that touches the database must start with `assertDatabaseEnv(process.env, "test-suite")`, exported from `@couch/database`.

## Client and IDs

- **Driver**: the client uses `@prisma/adapter-pg`, the standard `pg` driver over TCP. It connects to Neon through the pooled URL and works the same against any plain Postgres server, so CI can use a Postgres service container. `@prisma/adapter-neon` uses Neon's HTTP and WebSocket protocol and would not.
- **Exports**: `createPrismaClient({ connectionString })` builds a client. `getPrismaClient()` returns one shared instance kept on `globalThis`, so Next.js hot reload does not open a new pool on every reload. It reads `DATABASE_URL` on first use.
- **First connection**: Neon computes scale to zero and can take a few seconds to wake. The `pg` driver waits forever by default, so the factory sets `connectionTimeoutMillis` to 15 seconds. The database package's Vitest config sets 30 second test and hook timeouts for the same reason. A failed first connect can simply be retried.
- **IDs**: every model uses `String @id @default(uuid(7))`. Prisma generates the value. The Prisma docs do not name a recommended generator, so this is a choice: UUIDv7 values are time-ordered, so inserts stay at the end of the primary key index, and they are opaque, so ids do not reveal row counts. Use the same declaration on every new model.
