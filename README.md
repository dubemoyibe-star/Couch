# Couch

Couch: watch together remotely with synchronized playback.

Status: early development.

## Layout

| Path | What it is |
| --- | --- |
| [apps/web](apps/web/README.md) | Next.js app: UI and HTTP route handlers. |
| [apps/realtime](apps/realtime/README.md) | WebSocket service that authenticates connections and synchronizes rooms. |
| [packages/contracts](packages/contracts/README.md) | Wire schemas and derived types (Zod). |
| [packages/shared](packages/shared/README.md) | Pure cross-runtime logic: playback reducers, room state store, position and license rules. |
| [packages/providers](packages/providers/README.md) | Content provider layer. Metadata and links only. |
| [packages/database](packages/database/README.md) | Prisma and repositories over hosted Neon Postgres. |

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the packages, the dependency direction between them, and how it's enforced.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): database environments, migrations, and the `COUCH_DB_ENV` guard.
- [docs/LICENSING.md](docs/LICENSING.md): the licensing policy. Every media item needs a documented, human-verified licensing basis, and media files are never committed.

## Scripts

Run from the repo root:

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` in every package. |
| `pnpm lint` | ESLint in every package. |
| `pnpm test` | Every unit test (no database needed). |
| `pnpm test:db` | Database tests only (needs `.env.test`, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)). |
| `pnpm check:no-media` | Fails if a media file was committed. |
| `pnpm check:no-direct-db-access` | Fails if code outside `packages/database` queries `Media` or `LicenseRecord` directly. |

