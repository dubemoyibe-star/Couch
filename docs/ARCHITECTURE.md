# Architecture

Couch is a pnpm workspace of two apps and four packages, all under the `@couch/*` scope.

## Packages

| Package | Path | Responsibility |
| --- | --- | --- |
| `@couch/contracts` | packages/contracts | Wire schemas and the types derived from them (Zod). The validation boundary for all external input. |
| `@couch/shared` | packages/shared | Pure cross-runtime logic, such as sync and reducer code. Runs in the browser and in Node, so no Node-only or DOM-only APIs. |
| `@couch/providers` | packages/providers | Content provider layer. Metadata and links only, and every item carries a documented licensing basis. |
| `@couch/database` | packages/database | Prisma and repositories over hosted Neon Postgres. |
| `@couch/web` | apps/web | Next.js app: UI and HTTP route handlers. |
| `@couch/realtime` | apps/realtime | Realtime service that holds room state and synchronizes playback. |

## Dependency direction

- contracts: leaf. Depends only on zod.
- shared: may depend on contracts. Runtime-agnostic (browser and Node). No Node-only or DOM-only APIs.
- providers: may depend on contracts and shared.
- database: may depend on contracts and shared. Never on providers.
- apps may depend on any package. Apps never import from each other. Packages never import from apps.

```
apps/web      apps/realtime
      \          /
       v        v
  providers   database
       \       /
        v     v
        shared
           |
           v
       contracts
```

### How the rules are enforced

pnpm does not hoist workspace packages, so a package can only import `@couch/*` packages it declares in its own `package.json`. An undeclared import fails `pnpm -r typecheck` (TS2307). To add an edge, declare the dependency (`workspace:*`) in the importing package, and only if the rules above allow it.

The lists are deliberately minimal. Declared today:

- `@couch/web`: contracts, shared, providers, database.
- `@couch/realtime`: contracts, shared, database.
- `@couch/shared`: contracts, for types only (`import type`), so it has no runtime dependency on zod.
- `@couch/database`: contracts and shared. The catalog repository validates rows with the contracts schemas and the shared `isUseAuthorized`.

### Shared authentication core

Both apps must read a session cookie the same way, so the parts of the Better Auth configuration that must not diverge live in one place: `createAuthCoreOptions()` in `packages/database/src/auth-core.ts`, exported as `@couch/database/auth-core`. It holds the Prisma adapter (built on the existing `getPrismaClient()`), the secret, the base URL, session and cookie settings, trusted origins and the `name` to `displayName` field mapping. It holds no social providers and no email or verification hooks. Each app calls `betterAuth()` itself with the core plus its own additions (`apps/web/src/lib/auth.ts`) or nothing else (`apps/realtime/src/lib/auth.ts`, which only validates sessions).

Why inside `@couch/database` and not a new package or `apps/web`:

- Apps never import from each other, so it cannot live in an app.
- The core is tied to the Prisma adapter and the shared client that `@couch/database` already owns. A separate package would need to depend on `@couch/database` anyway, adding a package and an edge for a single function.
- It adds no edge to the dependency graph. `@couch/database` gains only the third-party `better-auth` dependency, pinned to the same version as `apps/web`.
- It is a subpath export, `@couch/database/auth-core`, not part of the package index, so code that only needs the repositories does not load Better Auth.

`@couch/contracts` and `@couch/providers` declare no `@couch/*` dependencies because they contain no code that uses one. Add each dependency where it is first used.

The base tsconfig sets `lib: ["ES2022"]` and `types: []`, so a package sees neither DOM nor Node globals unless it opts in. `apps/web` opts in to DOM and `@types/node`; `apps/realtime` opts in to `@types/node`. This is what keeps `shared` runtime-agnostic.

### Room state and connections

Room state is split by whether it needs a socket. `@couch/shared` holds the pure part: the playback reducers (`applyPlay`, `applyPause`, `applySeek`, `applySetRate`), `createInitialPlaybackState`, and the `RoomStore` interface with its in-memory implementation, which keeps one `RoomState` (couch id, media id or null, playback or null, playback access mode) per couch. `mediaId` and `playback` are null together. It has no I/O and no clock, so it is tested without sockets or a database. `apps/realtime` holds what needs live connection objects: the open sockets and who is online. Authorization, such as the host check, is applied by the realtime message handlers before they call a reducer.

Playback commands are judged and applied in one synchronous step: the handler reads the room, checks access, calls the reducer with the injected clock, stores the result and broadcasts `playback.sync` to every connection in the room, the sender included. Nothing awaits in between, so the single-threaded event loop runs commands one at a time and each revision builds on the last, with no lock. A command is allowed for the host, or for any attached connection while the room's access mode is `open`. Only the host can change the mode with `playback.setAccess`, which is checked from the role cached at join. A room is created when a couch first gets media, and it persists through a later clear, holding null media and playback and its access mode. A couch that never had media has no room. Commands on a couch with no media, whether it has no room or a cleared one, are refused with `media_unavailable`. A new room is `open`.

A connection is in exactly one room at a time. `room.join` checks membership in the database (`getMembership`), then attaches the connection; a second `room.join` on the same connection is refused with `already_joined` and never moves it. Presence is derived, not stored: a user is online in a room while at least one of their connections is attached to it. Their first connection announces `room.memberJoined` to the others, a further connection sends `presence.update` (online), and the close of their last connection, graceful or not, sends `presence.update` (offline). `room.leave` and `room.kick` call `leaveCouch` and `removeMember`, which own the authorization, and translate the result. Both act on the room the connection is attached to, never one named in a payload. `room.kick` first checks the role cached at join, a cheap refusal only: `removeMember` re-checks the host in the database. On success every connection the user has in that room is detached, so the others receive `room.memberLeft` once however many connections the user had. A leaver's own connections receive `room.memberLeft` naming themselves and stay open, free to join again. A kicked user's connections receive `room.kicked` and their sockets are closed with code 1008, because a connection is in one room and has no other purpose once removed. A room is created in the store on first use, and only for a couch whose current media resolves through the license gate.

`room.setMedia` is host only, checked from the role cached at join. It calls `setCurrentMedia`, which owns the host re-check and the license gate (`media_unavailable` for unauthorized, inactive or nonexistent media), so nothing of that is repeated in the handler. On success the room is replaced with a fresh initial `PlaybackState` (or null playback for a clear), reading the room's current access mode first and writing it back, so a media change or clear never resets the mode. Every connection in the room, the sender included, receives `room.mediaChanged` (`media` and `playback` both null on a clear). On failure only the requester is answered and the stored room is untouched.

## Consuming workspace packages

Decision: packages export their TypeScript source directly. There is no build step and no `dist`.

Each package sets `"exports": { ".": "./src/index.ts" }` (`@couch/database` adds the `./auth-core` subpath), and consumers depend on it with `workspace:*`.

- **apps/web**: the Next.js 16 docs (`transpilePackages`) state that Turbopack transpiles workspace packages automatically, and webpack does the same for the App Router. No `transpilePackages` entry is needed, so `next.config.ts` is unchanged. If a package ever has to be listed there (for example a Pages Router or a `node_modules` dependency that ships raw TypeScript), add it in that issue.
- **Type checking**: the base tsconfig uses `moduleResolution: "bundler"`, which resolves the `exports` map to the `.ts` file, so `tsc --noEmit` checks across packages without project references or a build.
- **Tests**: Vitest transforms TypeScript on the fly, so tests import package source directly.
- **apps/realtime**: type checking and tests work as above. Node cannot run these files as-is, because the sources use extensionless imports, so the service runs under `tsx` (`pnpm --filter @couch/realtime start`).

Why not build packages to `dist`: it adds a build graph, watch-mode ordering, and stale-output bugs for no gain at this size. Revisit only if a package must be published or consumed by something that cannot compile TypeScript.

## Tooling

- **TypeScript**: `tsconfig.base.json` at the root sets `strict: true` and shared options. Every package extends it and has a `typecheck` script. `apps/web` keeps Next's own options (`jsx`, `plugins`, `paths`, `include`, `lib`) locally.
- **Tests**: Vitest, one per package, run through `pnpm -r`. Packages without tests pass (`--passWithNoTests`). Vitest 5 requires Node 22.12 or newer, recorded in the root `engines`.
- **Lint**: ESLint 9 flat config. `apps/web` keeps its Next config. The root `eslint.config.mjs` reuses `eslint-config-next/typescript` for `apps/realtime` and `packages/*`. There is no formatter configured yet.
- **Scripts**: root `typecheck`, `lint`, `test` and `test:db` run `pnpm -r <script>`. `test` excludes tests that touch a database (`*.db.test.ts`); `test:db` runs only those. No Turborepo or Nx.
