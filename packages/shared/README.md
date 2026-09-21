# @couch/shared

Pure logic that runs unchanged in the browser and in Node. Sync and license rules live here so the server, the web app and the database layer all use one definition.

## Purity rules

Everything exported from this package obeys these rules:

- **No I/O.** No network, filesystem, database, logging or storage.
- **No clock.** Nothing calls `Date.now()`, `new Date()` or a timer. Time is always a parameter, so the caller decides what "now" means and a test can pass any value.
- **No randomness.** Nothing calls `Math.random()`.
- **Runtime-agnostic.** No Node-only APIs (`node:` imports, `process`, `Buffer`) and no DOM-only APIs (`window`, `document`, `TextEncoder` from the DOM lib). The TypeScript config exposes neither Node nor DOM globals, so a violation fails `pnpm -r typecheck`.
- **`import type` only from `@couch/contracts`.** Types are erased at build time, so this package has no runtime dependency on `@couch/contracts` and, through it, none on `zod`. A value import from contracts is not allowed here.
- **No other dependency.** `@couch/contracts` is the only one, and only for types.
- **No mutation.** Functions do not modify their arguments.

## `computeExpectedPosition(state, serverNowMs, options?)`

```ts
import { computeExpectedPosition } from "@couch/shared";

const position = computeExpectedPosition(state, serverNowMs, { durationSeconds: 5400 });
```

Returns the position, in seconds, that playback should be at at `serverNowMs`.

Units:

| Value                    | Unit                                   |
| ------------------------ | -------------------------------------- |
| `state.position`         | SECONDS                                |
| `state.serverTimestamp`  | epoch MILLISECONDS, SERVER clock       |
| `serverNowMs`            | epoch MILLISECONDS, SERVER clock       |
| `options.durationSeconds`| SECONDS                                |
| return value             | SECONDS                                |

The function reads no clock. The caller converts its own local clock to server time and passes that in.

Behavior:

| Situation                                                | Result                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `status` is `paused`                                     | `state.position`.                                                                            |
| `status` is `playing`                                    | `state.position + ((serverNowMs - state.serverTimestamp) / 1000) * state.playbackRate`.      |
| `serverNowMs` is earlier than `serverTimestamp` (skew)   | Elapsed time counts as 0, so the result is `state.position`.                                 |
| `serverNowMs` is NaN, Infinity or -Infinity              | Elapsed time counts as 0. The result is never NaN or Infinity.                               |
| The result would be below 0                              | 0.                                                                                           |
| `durationSeconds` is a finite number of at least 0       | The result is clamped to it, whether playing or paused.                                      |
| `durationSeconds` is anything else (NaN, negative, Infinity) | Ignored.                                                                                 |

Guarantees for a `state` that passed the contract schema: the result is finite and at least 0; at `serverNowMs` equal to `serverTimestamp` it equals `state.position` (before any duration clamp); and while playing at a rate above 0 it never decreases as `serverNowMs` increases.

This function does not correct drift and does not know about the client's clock offset. It does not check a client-reported position for plausibility.

## `isNewerRevision(candidate, current)`

True only when `candidate` is strictly greater than `current`. A lower revision is stale and an equal one is a repeat, so both are `false`. A NaN on either side is `false`.

## `isUseAuthorized(license)`

The one definition of "authorized" for a `LicenseRecord`. Other packages call it and never reimplement it.

It returns true only when all of these hold:

- `intendedUseAllowed` is true.
- `verifiedAt` is a real calendar date in `YYYY-MM-DD` form (`2026-02-30` and `2026/01/15` fail; `2024-02-29` passes). The contract schema checks this too, but a database row can be built without going through the schema, so it is checked again here.
- When `attributionRequired` is true, `attribution` is a string that is non-empty after trimming. When it is false, `attribution` can be null or empty.

Deliberately not checked: that `verifiedAt` is not in the future. That needs a clock, and this function takes none. A caller with a clock that wants the rule applies it on top.

The function checks that a record is complete and consistent. It cannot tell whether the values are true: they come from a person who verified the source.
