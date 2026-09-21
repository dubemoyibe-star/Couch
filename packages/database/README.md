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

## Destructive commands and AI agents

Prisma Migrate refuses destructive commands such as `migrate reset` when it detects an AI agent, unless `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` is set. An agent must stop and ask the maintainer, and must never set that variable itself.
