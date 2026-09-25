# @couch/web

The Couch web app: a Next.js (App Router) app with the UI and the HTTP route handlers. It signs users in with Better Auth, lists and creates couches, and shows the licensed media catalog.

This Next.js version has breaking changes from older releases. Read the relevant guide in `node_modules/next/dist/docs/` before changing framework-level code (see [AGENTS.md](AGENTS.md)).

## Run

From the repo root:

| Command | What it does |
| --- | --- |
| `pnpm --filter @couch/web dev` | Development server on http://localhost:3000. |
| `pnpm --filter @couch/web build` | Production build. |
| `pnpm --filter @couch/web start` | Serve the production build. |
| `pnpm --filter @couch/web typecheck` | `next typegen` then `tsc --noEmit`. |
| `pnpm --filter @couch/web lint` | ESLint. |
| `pnpm --filter @couch/web test` | Unit tests. No database needed. |
| `pnpm --filter @couch/web sync:catalog` | Sync the catalog manifest into the database. |
| `pnpm --filter @couch/web sync:catalog:test` | The same, against `.env.test`. |
| `pnpm --filter @couch/web send:test-email` | Send a test email through Resend, using `.env.local`. |

Environment files, database environments and the `COUCH_DB_ENV` guard are in [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md). The catalog sync and its licensing rules are in [docs/LICENSING.md](../../docs/LICENSING.md). Fake catalog data must only be synced with `--catalog-dir` and `sync:catalog:test`, never into the dev database and never from the real `packages/providers/catalog/`.

## Layout

| Path | Contents |
| --- | --- |
| `src/app/(app)/` | Signed-in pages: home, `couches`, `couch/create`, `couch/[id]`, `join/[code]`, `catalog` and `catalog/[id]`, with modal routes under `@modal`. |
| `src/app/sign-in`, `sign-up`, `sign-out`, `forgot-password`, `reset-password`, `verify-email` | Authentication pages. |
| `src/app/api/auth/[...all]` | The Better Auth route handler. |
| `src/lib/` | Auth configuration and client, email, session helpers, couch and invite-code helpers. |
| `scripts/` | The catalog sync and the test-email script. |

## Dependencies on other packages

`@couch/contracts`, `@couch/shared`, `@couch/providers` and `@couch/database`. Packages export TypeScript source directly, and Next.js transpiles them, so no `transpilePackages` entry is needed. See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
