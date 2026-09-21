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

`@couch/contracts` and `@couch/providers` declare no `@couch/*` dependencies because they contain no code that uses one. Add each dependency where it is first used.

The base tsconfig sets `lib: ["ES2022"]` and `types: []`, so a package sees neither DOM nor Node globals unless it opts in. `apps/web` opts in to DOM and `@types/node`; `apps/realtime` opts in to `@types/node`. This is what keeps `shared` runtime-agnostic.

## Consuming workspace packages

Decision: packages export their TypeScript source directly. There is no build step and no `dist`.

Each package sets `"exports": { ".": "./src/index.ts" }`, and consumers depend on it with `workspace:*`.

- **apps/web**: the Next.js 16 docs (`transpilePackages`) state that Turbopack transpiles workspace packages automatically, and webpack does the same for the App Router. No `transpilePackages` entry is needed, so `next.config.ts` is unchanged. If a package ever has to be listed there (for example a Pages Router or a `node_modules` dependency that ships raw TypeScript), add it in that issue.
- **Type checking**: the base tsconfig uses `moduleResolution: "bundler"`, which resolves the `exports` map to the `.ts` file, so `tsc --noEmit` checks across packages without project references or a build.
- **Tests**: Vitest transforms TypeScript on the fly, so tests import package source directly.
- **apps/realtime**: type checking and tests work as above. The runtime for the service (for example `tsx` or a bundler) is chosen in the issue that builds the service. Node cannot run these files as-is, because the sources use extensionless imports.

Why not build packages to `dist`: it adds a build graph, watch-mode ordering, and stale-output bugs for no gain at this size. Revisit only if a package must be published or consumed by something that cannot compile TypeScript.

## Tooling

- **TypeScript**: `tsconfig.base.json` at the root sets `strict: true` and shared options. Every package extends it and has a `typecheck` script. `apps/web` keeps Next's own options (`jsx`, `plugins`, `paths`, `include`, `lib`) locally.
- **Tests**: Vitest, one per package, run through `pnpm -r`. Packages without tests pass (`--passWithNoTests`). Vitest 5 requires Node 22.12 or newer, recorded in the root `engines`.
- **Lint**: ESLint 9 flat config. `apps/web` keeps its Next config. The root `eslint.config.mjs` reuses `eslint-config-next/typescript` for `apps/realtime` and `packages/*`. There is no formatter configured yet.
- **Scripts**: root `typecheck`, `lint`, `test` and `test:db` run `pnpm -r <script>`. `test` excludes tests that touch a database (`*.db.test.ts`); `test:db` runs only those. No Turborepo or Nx.
