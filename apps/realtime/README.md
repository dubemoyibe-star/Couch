# @couch/realtime

The realtime service: a WebSocket server (`ws`, in `noServer` mode behind Node's `http` server) that authenticates each connection from the session cookie and parses every message against the `@couch/contracts` catalog. It runs as a plain Node process under `tsx`.

Room state and playback logic are pure and live in `@couch/shared` (the playback reducers and `RoomStore`). This app owns everything that touches a socket: the handshake, the connections, and who is online.

## Run

From the repo root:

| Command | What it does |
| --- | --- |
| `pnpm --filter @couch/realtime dev` | Start with file watching. |
| `pnpm --filter @couch/realtime start` | Start once. |
| `pnpm --filter @couch/realtime test` | Unit tests, against a real ws server with a stand-in session lookup. No database. |
| `pnpm --filter @couch/realtime test:db` | The same server against real sessions in the `testing` database. Needs `.env.test`. |

It loads `.env.local` from the repo root when present, and hosting providers inject the variables instead. It needs `DATABASE_URL`, `DIRECT_URL`, `COUCH_DB_ENV`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, and the secret and URL must match the ones `apps/web` uses. `PORT` sets the port (default `3001`).

## Layout

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Entry point: loads the environment, builds the server, handles `SIGTERM` and `SIGINT`. |
| `src/lib/server.ts` | The HTTP and WebSocket server: origin and session checks at the upgrade, per-connection identity, shutdown. |
| `src/lib/inbound.ts` | Turns one received frame into a parsed client message or the contract's `error` reply. Pure. |
| `src/lib/session.ts` | Resolves a cookie to a user id through Better Auth. |
| `src/lib/auth.ts` | The Better Auth instance, built from the shared auth core (`@couch/database/auth-core`). |
| `src/lib/env.ts` | Loads the repo-root env file. |

## Behavior

The handshake order, the identity rule, message handling, size limits and shutdown are described in [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md#realtime-service). The message formats and error codes are in [packages/contracts/README.md](../../packages/contracts/README.md).

In short: a refused upgrade gets a plain HTTP status (`400`, `401`, `403` or `503`), a non-upgrade request gets `426`, and identity comes only from the validated session, never from a message payload.
