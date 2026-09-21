# @couch/contracts

Wire schemas and the types derived from them. This is the validation boundary for all external input. It depends only on `zod` and runs in the browser and in Node.

This package defines the envelope every realtime message uses, how messages are named and versioned, and how raw input is parsed safely. Concrete events (room, playback, chat and so on) are declared with `defineEvent`.

## Envelope

Every message is one JSON object:

```json
{ "v": 1, "type": "chat.send", "id": "c-42", "payload": {} }
```

| Field     | Meaning                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| `v`       | Protocol version. Currently `1`.                                                |
| `type`    | Event name, `domain.action`. Selects the payload schema.                        |
| `id`      | Optional client-generated correlation id, 1 to 64 characters (`MAX_ID_LENGTH`). |
| `payload` | Always an object, so it can gain optional fields later.                         |

Identity never travels in a message. The server takes it from the authenticated connection.

## Declaring an event

```ts
import * as z from "zod";
import { defineEvent, type MessageOf } from "@couch/contracts";

const sendChat = defineEvent({
  type: "chat.send",
  direction: "client",
  payload: { text: z.string().min(1).max(500) },
});

type SendChat = MessageOf<typeof sendChat>;
// { v: 1; type: "chat.send"; id?: string; payload: { text: string } }
```

`defineEvent` takes the payload as a shape (the argument of `z.object`), not a finished schema. The builder owns the object schema so it can apply the direction rule below by construction, and so a payload is always an object. It returns `{ type, direction, payload, envelope }`, where `envelope` is the full Zod schema for the message. There is no class hierarchy and no registry. To accept a set of events, pass an array of definitions to `parseMessage`.

Nested objects inside a payload follow whatever schema the author writes. In `client` payloads, use `z.strictObject` for nested objects so the reject rule reaches them too.

## Direction and strictness

| Direction | Sender           | Unknown keys                                | Why                                                                                                                            |
| --------- | ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `client`  | client to server | Rejected, at the envelope and payload level | The sender is untrusted. The server must not accept noise, and an unknown key is a sign of a bug or an attack.                 |
| `server`  | server to client | Stripped                                    | The server is trusted and evolves first. Stripping means an additive server change (a new field) never breaks an older client. |

An unknown `type` from the server is reported as `unknown_type`, so a client can ignore it and carry on. Strictness is decided by the event's direction, which the definition carries.

## Naming

- `type` is `domain.actionName`: exactly two segments separated by one dot. The domain is lowercase letters only. The action starts with a lowercase letter and may then contain letters and digits, so it is camelCase (`room.join`, `playback.setRate`, `room.mediaChanged`). `defineEvent` throws at definition time, with a message naming the rule, if the name does not match.
- The one exception is the reserved type `error`.
- Types are case-sensitive on the wire and matched exactly: `playback.setrate` and `playback.SETRATE` do not match `playback.setRate` and are reported as `unknown_type`. No two types may differ only by case, because clients and servers could then confuse them.
- Client to server messages are intents (commands): "I want to do this." The server decides the outcome.
- Server to client messages are facts (state or events): "this is now true." Clients render them.

## Versioning

`v` is the protocol version. `SUPPORTED_VERSIONS` lists what the parser accepts.

Breaking (bump `v`):

- Removing or renaming a type or a field.
- Changing the meaning of a type or a field.
- Making an optional field required, or narrowing what a field accepts.

Additive (no bump):

- A new type.
- A new optional field.
- A new `ErrorCode`. Clients treat a code they do not know as a generic error (see Error codes).

Clients that receive a `v` they do not support get `unsupported_version` before any other check, so a future payload shape is never misreported as `invalid_payload`.

## Parsing

`parseMessage(raw, events)` returns `{ ok: true, data }` or `{ ok: false, error }`. It never throws on bad input. `error` is `{ code, message, replyTo? }`: a stable code, a fixed safe message (it never echoes input), and the correlation id when there is one.

`events` is the list of definitions this side accepts: the client events on the server, the server events on a client. The known types are read from that same list and each definition's `envelope` schema validates the payload, so there is no second list of types to keep in sync.

Stages run in this order and the first failure wins:

| #   | Check                                                                                                                                                          | Failure code          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | Size in UTF-8 bytes is at most `MAX_MESSAGE_BYTES` (64 KiB). Measured in bytes, not string length.                                                             | `message_too_large`   |
| 2   | Valid JSON.                                                                                                                                                    | `invalid_json`        |
| 3   | Top level is a plain object. Arrays, `null` and scalars are `invalid_json`: they are not a message, and a separate code would add nothing a client can act on. | `invalid_json`        |
| 4   | `v` is a supported version. A missing or non-numeric `v` counts as unsupported.                                                                                | `unsupported_version` |
| 5   | `type` is one of the known types.                                                                                                                              | `unknown_type`        |
| 6   | The envelope schema, including the payload, `id` and unknown-key rules.                                                                                        | `invalid_payload`     |

`invalid_payload` therefore also covers a bad envelope field (an over-long `id`, or an extra top-level key on a client message).

`replyTo` is set on failures after step 3 when the message has an `id` that is a string of 1 to 64 characters. Otherwise it is absent. Failures at steps 1 to 3 never carry it.

The byte count uses a small pure function (`utf8ByteLength`) instead of `TextEncoder` or `Buffer`, because this package's TypeScript config exposes neither DOM nor Node globals. A test checks it against `TextEncoder`.

## Playback

`playbackStateSchema` is a standalone object schema, so other server messages can embed it. It holds no media id: media belongs to room state. Units are part of the contract, so every field states one.

| Field             | Type                      | Unit and meaning                                                                                            |
| ----------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `status`          | `"playing"` or `"paused"` | Whether the media is advancing.                                                                             |
| `position`        | number                    | SECONDS from the start of the media, as of `serverTimestamp`. Finite, 0 to `PLAYBACK_POSITION_MAX_SECONDS`. |
| `playbackRate`    | number                    | Multiplier of normal speed. From `PLAYBACK_RATE_MIN` to `PLAYBACK_RATE_MAX`, both inclusive.                |
| `revision`        | non-negative safe integer | Unitless counter the server increments on every state change.                                               |
| `serverTimestamp` | non-negative safe integer | Epoch MILLISECONDS on the SERVER clock at which `position` was true.                                        |

Constants:

| Constant                        | Value   | Notes                                                                                                             |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `PLAYBACK_POSITION_MAX_SECONDS` | `86400` | A sanity cap that only rejects garbage on the wire. The server clamps a position to the real media duration.      |
| `PLAYBACK_RATE_MIN`             | `0.5`   | Half speed.                                                                                                       |
| `PLAYBACK_RATE_MAX`             | `2`     | Double speed. The 0.5 to 2 range is what mainstream players offer and keeps extrapolation between syncs accurate. |

Client to server commands (`playbackClientEvents`):

| Type               | Payload        | Notes                                                                                                   |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------- |
| `playback.play`    | `{ position }` | `position` is the client-reported position in seconds. The server validates it and stays authoritative. |
| `playback.pause`   | `{ position }` | Same as `playback.play`.                                                                                |
| `playback.seek`    | `{ position }` | Target position in seconds.                                                                             |
| `playback.setRate` | `{ rate }`     | Multiplier of normal speed.                                                                             |

Commands never carry a revision, a timestamp, a user id or a role. Unknown keys are rejected, as for every client event.

Server to client (`playbackServerEvents`): `playback.sync` with `payload: { state: PlaybackState }`. Unknown keys are stripped.

Revision rule: a client discards a `playback.sync` whose `revision` is lower than the one it holds, and treats an equal `revision` as idempotent (applying it again changes nothing). A stale sync that arrives late therefore never rewinds the client.

The arrays are in the shape `parseMessage` takes, and the message types are exported (`PlaybackPlay`, `PlaybackPause`, `PlaybackSeek`, `PlaybackSetRate`, `PlaybackSync`, `PlaybackClientMessage`, `PlaybackServerMessage`, `PlaybackState`), all inferred from the schemas.

## Media, license and playback source

Licensing and provenance are structural: there is no exported schema or type for media without a license. The provider-side media fields exist only as a module-private field map, and every exported media schema adds a required `license`.

Every license value is entered by someone who verified the source. Nothing is guessed or inferred, and the schemas do not check the truth of a value, only its shape.

### `LicenseRecord`

All fields are required. "Or null" means the key must still be present, so a value can never be omitted by accident.

| Field                    | Type           | Meaning                                                                                                                                                                    |
| ------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `licenseName`            | string         | The license's name as the licensor publishes it.                                                                                                                           |
| `licenseVersion`         | string or null | The published version, or null when a version does not apply.                                                                                                              |
| `licenseUrl`             | https URL      | The license text on the licensor's site.                                                                                                                                   |
| `sourceUrl`              | https URL      | The page where the item and its license were verified.                                                                                                                     |
| `rightsholder`           | string or null | The original creator or rightsholder, where available.                                                                                                                     |
| `attributionRequired`    | boolean        | Whether credit must be shown.                                                                                                                                              |
| `attribution`            | string or null | The credit text the UI shows. Must be non-empty after trimming when `attributionRequired` is true.                                                                         |
| `intendedUseAllowed`     | boolean        | Whether the intended Couch use is permitted: synchronized remote viewing through the provider's authorized playback. Couch never copies, hosts or redistributes the media. |
| `commercialUseAllowed`   | boolean        | Whether the license allows commercial use in general.                                                                                                                      |
| `additionalRestrictions` | string or null | Any other restriction. Null means a maintainer read the terms and found none, never "not checked".                                                                         |
| `verifiedAt`             | `YYYY-MM-DD`   | The calendar date of the last verification. Must be a real date: `2026-02-30` and non-ISO forms fail.                                                                      |
| `verificationNotes`      | string or null | Free-form notes from the verification.                                                                                                                                     |

`intendedUseAllowed` and `commercialUseAllowed` are independent. The first answers "may Couch show this item this way". The second answers "does the license allow commercial use at all". An item can allow the first and not the second. Both are stored so that a deployment whose commercial status changes can find the affected items. When either is unclear, record false. The schema records the verified answer. It does not decide whether an item may enter the catalog.

The date is not compared with today, because this package has no clock.

### Media

| Field             | Type              | Meaning                                                                                |
| ----------------- | ----------------- | -------------------------------------------------------------------------------------- |
| `providerId`      | lowercase slug    | Lowercase letters and digits in groups joined by single hyphens.                       |
| `providerMediaId` | string            | The provider's own id. Opaque, so it is never interpreted or changed. See Opaque ids.  |
| `title`           | string            |                                                                                        |
| `description`     | string or null    |                                                                                        |
| `durationSeconds` | number or null    | SECONDS. Positive, at most `PLAYBACK_POSITION_MAX_SECONDS` (86400).                    |
| `posterUrl`       | https URL or null |                                                                                        |
| `releaseYear`     | integer or null   | `MEDIA_LIMITS.releaseYearMin` to `releaseYearMax` (1800 to 2100), a sanity range only. |
| `license`         | `LicenseRecord`   | Required.                                                                              |

| Export                                        | Contains                        | Notes                                                                                                         |
| --------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `mediaWithLicenseSchema` / `MediaWithLicense` | The media fields and `license`  | What a provider returns and a manifest contains. No internal id.                                              |
| `catalogMediaSchema` / `CatalogMedia`         | `MediaWithLicense` plus `id`    | `id` is the internal catalog id, an opaque id. It goes over the wire so the UI can display attribution.       |
| `mediaRefSchema` / `MediaRef`                 | `providerId`, `providerMediaId` | Identifies an item on its provider.                                                                           |

### Opaque ids

`providerMediaId` and the catalog `id` are opaque: Couch never interprets them, so it never changes them either. An id that is trimmed or rewritten can stop matching the id the provider knows, so these fields are checked and returned exactly as given:

- Leading or trailing whitespace is rejected, not trimmed. Unicode whitespace counts, so a leading no-break space fails.
- ASCII control characters (U+0000 to U+001F and U+007F) are rejected anywhere in the id.
- Spaces inside an id are allowed.
- Empty is rejected, and so is an id over its limit.

`providerId` keeps its slug rule. Every other free-text field is still trimmed.

### Duration

`durationSeconds` is at most `PLAYBACK_POSITION_MAX_SECONDS`, the same exported constant that caps a playback position. It is the single source of truth, so an item can never be longer than the playback schema can seek to.

### `PlaybackSource`

A source is a union discriminated on `kind`: `mp4`, `hls`, `dash` or `embed`. Each has an https `url` and an optional `expiresAt`, epoch MILLISECONDS as a non-negative safe integer. A resolved source can expire, so it is re-resolved on reconnect.

- `playbackSourceSchema` is the ingest flavor. Unknown keys are rejected.
- `playbackSourceWireSchema` is the wire flavor. Unknown keys are stripped.

Both are built from the same field map for each kind, so they cannot drift. They infer the same `PlaybackSource` type.

### Strict and tolerant

The same rule as for messages applies, decided by where the data comes from.

| Flavor          | Exports                                                                                                         | Unknown keys             | Use it for                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| Ingest (strict) | `licenseRecordSchema`, `mediaWithLicenseSchema`, `catalogMediaSchema`, `mediaRefSchema`, `playbackSourceSchema` | Rejected, at every level | Provider output, catalog manifests, database upserts. Anything that authors data. |
| Wire (tolerant) | `licenseRecordWireSchema`, `catalogMediaWireSchema`, `playbackSourceWireSchema`                                 | Stripped, at every level | Catalog media and playback sources received from the server.                      |

A misspelled key such as `additionalRestrictons` must fail loudly on the ingest path, because a stripped restriction is a licensing bug. On the wire the server evolves first, so stripping keeps an older client working when a field is added.

Both flavors are built from one field map: `z.strictObject(shape)` for ingest and `z.object(shape)` for wire, with the attribution rule applied to each by one shared function. A playback source does the same with one field map per `kind`. They cannot drift, and the wire flavor enforces every rule except the unknown-key one. Media takes its license schema as a parameter, so a strict media object nests the strict license and a wire media object nests the tolerant one. Both flavors infer the same TypeScript type, which is exported once (`LicenseRecord`, `CatalogMedia`, `PlaybackSource`).

### URLs

Every url field must be an `https` URL with no embedded credentials.

- The protocol is restricted with `z.url({ protocol: /^https$/ })`. Zod's `z.httpUrl()` is not used because it also accepts plain `http`.
- Zod has no option for userinfo, so a refinement rejects an `@` in the authority (the part after `https://` up to the first `/`, `\`, `?` or `#`), which is where `user:pass@` has to be. An `@` in the path, query or fragment is legitimate and passes.
- The value must literally start with `https://`. The URL parser accepts `https:host` and silently drops leading control characters, and either could hide userinfo from the check.
- At most `MEDIA_LIMITS.url` characters.

### Limits

Exported as `MEDIA_LIMITS`. String lengths count UTF-16 code units. Free-text strings are trimmed, and a present value must be non-empty after trimming, so absence is always `null` and never `""`. Opaque ids are not trimmed (see Opaque ids).

| Field                    | Max  |
| ------------------------ | ---- |
| `providerId`             | 64   |
| `providerMediaId`        | 256  |
| `id` (catalog)           | 128  |
| `title`                  | 200  |
| `description`            | 5000 |
| `licenseName`            | 200  |
| `licenseVersion`         | 32   |
| `rightsholder`           | 300  |
| `attribution`            | 1000 |
| `additionalRestrictions` | 2000 |
| `verificationNotes`      | 2000 |
| every url                | 2048 |

## Error codes

Sent by the server as the `error` event (server direction): `payload: { code, message, replyTo? }`.

| Code                  | Meaning                             |
| --------------------- | ----------------------------------- |
| `invalid_json`        | Not JSON, or not a JSON object.     |
| `message_too_large`   | Over `MAX_MESSAGE_BYTES`.           |
| `unsupported_version` | `v` is not in `SUPPORTED_VERSIONS`. |
| `unknown_type`        | `type` is not a known event.        |
| `invalid_payload`     | Right type, wrong shape.            |

New codes are added to `ERROR_CODES`. Never rename or remove a code.

On the wire, `code` is any non-empty string of at most `MAX_ERROR_CODE_LENGTH` (64) characters, not a strict enum. A client built before a new code was added therefore still parses the `error` message instead of rejecting it as `invalid_payload`. A client MUST treat a code it does not know as a generic error: show or log the message and carry on.

`isKnownErrorCode(code)` is a type guard that narrows a `string` to `ErrorCode`:

```ts
if (isKnownErrorCode(payload.code)) {
  // payload.code is an ErrorCode here: handle it specifically
} else {
  // A code from a newer server: treat it as a generic error
}
```

The inferred type of `code` still lists the known codes, so editors offer them as completions. The failures `parseMessage` itself returns are typed with the strict `ErrorCode` union, since this package only ever produces known codes. `errorCodeSchema` remains a strict enum, for code that validates a code it produces.
