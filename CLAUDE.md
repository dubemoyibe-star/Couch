# Couch: standing rules for Claude Code

## Code

- TypeScript strict. No `any` unless justified in a comment.
- Validate all external input at the boundary (Zod, in packages/contracts). Never trust client-supplied state. Identity comes from the authenticated connection, never from a message payload.
- Sync and reducer logic must be pure: no I/O, no timers, no direct Date.now() or Math.random(). Inject the clock. It must be testable without sockets or a database.
- Do not build for hypothetical scale. No Redis, queues, or extra services in the MVP.
- Avoid em dashes in code comments and docs.

## Licensing (hard requirement)

- Never add content because it is available online. Every media item needs a documented licensing basis (see docs/LICENSING.md once it exists).
- Never invent or guess license data. License fields come from a human who verified the source.
- Never commit media files. Metadata and links only.
- Never build or commit unofficial, reverse-engineered, scraped, or circumvention-based integrations. Never bypass authentication, DRM, signatures, anti-bot measures, or provider terms.
- There is no bypass flag or environment variable that skips the license gate, and none may be added.

## Database

- The database is hosted Neon Postgres. There is no local Postgres and no docker-compose.
- Never print, log, echo, or commit connection strings or passwords. Redact them in any output you report. Real values live only in untracked .env files.
- Never run destructive database commands (reset, drop, truncate, migrate reset) unless COUCH_DB_ENV is dev or test. Never run tests against a database where COUCH_DB_ENV is not exactly test.
- Never run any database command against a production database unless the maintainer explicitly asks in that session.
