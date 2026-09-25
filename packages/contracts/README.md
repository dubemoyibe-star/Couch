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
| 1   | Size in UTF-8 bytes is at most the cap for the events' direction (see Size caps). Measured in bytes, not string length.                                        | `message_too_large`   |
| 2   | Valid JSON.                                                                                                                                                    | `invalid_json`        |
| 3   | Top level is a plain object. Arrays, `null` and scalars are `invalid_json`: they are not a message, and a separate code would add nothing a client can act on. | `invalid_json`        |
| 4   | `v` is a supported version. A missing or non-numeric `v` counts as unsupported.                                                                                | `unsupported_version` |
| 5   | `type` is one of the known types.                                                                                                                              | `unknown_type`        |
| 6   | The envelope schema, including the payload, `id` and unknown-key rules.                                                                                        | `invalid_payload`     |

`invalid_payload` therefore also covers a bad envelope field (an over-long `id`, or an extra top-level key on a client message).

`replyTo` is set on failures after step 3 when the message has an `id` that is a string of 1 to 64 characters. Otherwise it is absent. Failures at steps 1 to 3 never carry it.

### Size caps

The cap depends on which side is parsing. `parseMessage` takes it from the direction of the event definitions it is given.

| Constant                   | Value             | Applies to                                       | Protects                                                                                                                                                                                                 |
| -------------------------- | ----------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAX_CLIENT_MESSAGE_BYTES` | 64 KiB (65,536)   | Messages a client sends, parsed with `clientEvents` | The server. Client messages are untrusted input and small, so anything larger is refused before it is parsed.                                                                                         |
| `MAX_SERVER_MESSAGE_BYTES` | 256 KiB (262,144) | Messages the server sends, parsed with `serverEvents` | The client. The server is trusted, so the cap only bounds what a client buffers and parses if the server is broken or a proxy injects data. It is large enough for a legitimate `room.state`.  |

Why 256 KiB: the largest server message is `room.state`. With every field at its limit and every character taking 4 bytes in UTF-8, it is about 149,000 bytes, more than twice the client cap, and a client that refused it could not join the room. 256 KiB holds that case with room to spare for the snapshot to grow, and it is still small enough to buffer without concern.

A list that mixes directions is held to the smaller cap, the client cap, and so is an empty list. A message is never held to a looser limit than the strictest event that could accept it. Only the limit depends on the direction. The stages and their order do not.

### Two thresholds on the realtime server

The realtime server enforces client message size at two layers, with two different numbers and two different outcomes:

| Threshold | Value | Enforced by | What the client sees |
| --- | --- | --- | --- |
| Soft cap: `MAX_CLIENT_MESSAGE_BYTES` | 64 KiB (65,536) | `parseMessage` (stage 1) | An `error` message with code `message_too_large`. The connection stays open and the client can send its next message. |
| Hard cutoff: the WebSocket max payload, set to 2 x the soft cap | 128 KiB (131,072) | The `ws` library, before the frame is buffered whole | The connection is closed with WebSocket close code 1009 ("message too big"). No `error` message is sent. |

A message of 64 KiB or less is parsed normally. One between 64 KiB and 128 KiB is read in full, refused by `parseMessage`, and answered with `message_too_large`. One over 128 KiB is never read in full: the socket layer drops it and ends the connection.

Why two numbers and not one: the point of a socket-level limit is to stop the server buffering an arbitrarily large frame. But when `ws` refuses a frame it closes the connection immediately, and the socket is already closing by the time application code sees the error, so nothing can be sent back. If the socket limit equalled the soft cap, every over-cap message would end the connection with a bare 1009, and `message_too_large` would never be sent at all, which defeats the reply this contract defines. Setting the socket limit above the soft cap lets ordinary oversized messages get the graceful reply, while a frame far past any legitimate size still gets the abrupt close. The cost is that the server may buffer up to 128 KiB per message instead of 64 KiB. The hard cutoff is a multiple of the soft cap, so changing `MAX_CLIENT_MESSAGE_BYTES` moves both.

A client should treat close code 1009 as "I sent something far too large", not as a network failure to retry blindly.

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

Exported as `MEDIA_LIMITS`. String lengths count Unicode code points, which is how Zod measures them, so an emoji counts as 1. A combining mark counts as a code point of its own, and a ZWJ sequence such as a family emoji counts as several. These are field limits, not byte sizes: a code point takes 1 to 4 bytes in UTF-8, and messages are held to the byte caps in Size caps. Free-text strings are trimmed, and a present value must be non-empty after trimming, so absence is always `null` and never `""`. Opaque ids are not trimmed (see Opaque ids).

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

## Message catalog

`clientEvents` and `serverEvents` list every event definition, in the shape `parseMessage` takes. They are the single source of truth for the catalog: the server parses with `clientEvents` and a client parses with `serverEvents`. `ClientMessage` and `ServerMessage` are the parsed message types. Each domain also exports its own list (`roomClientEvents`, `roomServerEvents`, `chatClientEvents`, `chatServerEvents`, `playbackClientEvents`, `playbackServerEvents`).

| Direction | Type                | Payload                                                          | Purpose                                                    | Who may send it                                       |
| --------- | ------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| client    | `room.join`         | `{ couchId }`                                                    | Join a couch.                                              | Any authenticated connection.                         |
| client    | `room.leave`        | `{}`                                                             | Leave the joined couch.                                    | A joined member.                                      |
| client    | `chat.send`         | `{ text }`                                                       | Send a chat message to the room.                           | A joined member.                                      |
| client    | `room.setMedia`     | `{ mediaId }`                                                    | Change the media the room is watching.                     | Host only. The server enforces it.                    |
| client    | `room.kick`         | `{ userId }`                                                     | Remove a member. `userId` is the target, never the sender. | Host only. The server enforces it.                    |
| client    | `playback.play`     | `{ position }`                                                   | Start or resume playback.                                  | A joined member. The server decides which roles may.  |
| client    | `playback.pause`    | `{ position }`                                                   | Pause playback.                                            | A joined member. The server decides which roles may.  |
| client    | `playback.seek`     | `{ position }`                                                   | Jump to a position.                                        | A joined member. The server decides which roles may.  |
| client    | `playback.setRate`  | `{ rate }`                                                       | Change the playback speed.                                 | A joined member. The server decides which roles may.  |
| server    | `room.state`        | `{ couch, self, members, media, playback }`                      | Full room snapshot, sent on join and on reconnect.         | Server only.                                          |
| server    | `room.mediaChanged` | `{ media, playback }`                                            | The room switched to another media item.                   | Server only.                                          |
| server    | `room.memberJoined` | `{ member }`                                                     | Someone became a member. `member` is `{ userId, displayName, role, online }`. | Server only.                                          |
| server    | `room.memberLeft`   | `{ userId }`                                                     | A member was removed for good: they left or were kicked.   | Server only.                                          |
| server    | `presence.update`   | `{ userId, online }`                                             | An existing member went online or offline.                 | Server only.                                          |
| server    | `chat.message`      | `{ id, userId, displayName, text, sentAt }`                      | A chat message, with the sender and time set by the server. | Server only.                                          |
| server    | `room.kicked`       | `{ reason? }`                                                    | The recipient was removed from the room.                   | Server only.                                          |
| server    | `playback.sync`     | `{ state }`                                                      | The authoritative playback state.                          | Server only.                                          |
| server    | `error`             | `{ code, message, replyTo? }`                                    | A message was rejected or could not be acted on.           | Server only.                                          |

Roles are `"host"` and `"participant"`. "Host only" is a rule the server applies. The contract only shapes the message, so a participant's `room.setMedia` parses and the server answers it with `forbidden`.

A client message never carries the sender's identity, a role or a timestamp. The server takes identity from the authenticated connection and stamps `id` and `sentAt` itself. `room.kick.userId` is the one `userId` a client sends, and it names the member to remove.

There is no client-sent presence message. Presence is derived by the server from connections: a member is online while at least one of their connections is open. `presence.update` and the `online` flag in `room.state` are how clients learn it.

### Member lifecycle

A client keeps its member list current from four server messages. Each has one job:

| Moment                                                             | Message             | Notes                                                                                                                      |
| ------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A member joins, or reconnects                                      | `room.state`        | Sent to the one who joined or reconnected. It replaces everything the client knew and already lists them.                  |
| Someone becomes a member of the room                               | `room.memberJoined` | Sent to the members already there, with the new member's `userId`, `displayName`, `role` and `online`. Add them to the list. |
| An existing member connects or drops their last connection         | `presence.update`   | Only for a member the client already has. It changes `online` and nothing else. It never adds or removes a member.         |
| A member is removed for good, because they left or were kicked     | `room.memberLeft`   | Remove them from the list. A member who only disconnects is not removed: that is a `presence.update`.                       |

A kicked member also receives `room.kicked`, and the others receive `room.memberLeft` for them.

### `room.state`

| Field      | Type                     | Meaning                                                                             |
| ---------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `couch`    | `{ id, name }`           | The couch. `name` is trimmed and non-empty.                                         |
| `self`     | `{ userId, role }`       | The recipient's own identity and role, as the server knows them.                    |
| `members`  | array, at most `ROOM_MEMBERS_MAX` | Each is `{ userId, displayName, role, online }`.                           |
| `media`    | `CatalogMedia` or null   | The current media item, wire flavor (unknown keys stripped). Present, never omitted. |
| `playback` | `PlaybackState` or null  | The current playback state. Present, never omitted.                                 |

Invariant: `media` is null exactly when `playback` is null. A room with no media has no playback, and a room with media always has a playback state. The schema does not enforce this on purpose. A server bug that breaks it should not make a client drop the whole snapshot, so the client decides how to render a mismatch. It is covered by a test on valid examples instead.

`room.mediaChanged` carries a non-null `media` and `playback`, so a room that already has media switches to another item in one message.

### Identity, names and text

Ids (`couchId`, `mediaId`, `userId`, and the chat message `id`) are opaque and follow the Opaque ids rules above: no leading or trailing whitespace, no ASCII control characters, non-empty, and within the limit. `mediaId` uses the catalog id limit.

Lengths in this section count Unicode code points, which is how Zod measures string length. An emoji counts as 1. A combining mark counts as a code point of its own, and a ZWJ sequence such as a family emoji counts as several. These are field limits, not byte sizes: a code point takes 1 to 4 bytes in UTF-8, and messages are held to the byte caps in Size caps.

| Export                       | Value | Applies to                                                                |
| ---------------------------- | ----- | ------------------------------------------------------------------------- |
| `COUCH_ID_MAX_LENGTH`        | 128   | `couchId`, `couch.id`.                                                    |
| `USER_ID_MAX_LENGTH`         | 128   | Every `userId`.                                                           |
| `CHAT_MESSAGE_ID_MAX_LENGTH` | 128   | `chat.message.id`.                                                        |
| `MEDIA_LIMITS.catalogId`     | 128   | `mediaId`.                                                                |
| `DISPLAY_NAME_MAX_LENGTH`    | 50    | `displayName`. Trimmed, non-empty after trimming.                         |
| `COUCH_NAME_MAX_LENGTH`      | 100   | `couch.name`. Trimmed, non-empty after trimming.                          |
| `CHAT_MAX_LENGTH`            | 500   | Chat `text`, counted after trimming.                                      |
| `KICK_REASON_MAX_LENGTH`     | 200   | `room.kicked.reason`. Trimmed, non-empty after trimming when present.     |
| `ROOM_MEMBERS_MAX`           | 100   | Length of `room.state.members`.                                           |

Chat text is checked in this order: any ASCII control character other than newline (U+000A) rejects the message, which means a C0 control character (U+0000 to U+001F) and DEL (U+007F). Then the text is trimmed, then it must be non-empty and at most `CHAT_MAX_LENGTH`. The control check runs on the text as sent, so a tab or carriage return at the edge is rejected and not trimmed away. Newlines inside the text are kept. `chat.send` and `chat.message` use the same text schema.

`displayName` and the couch name are single-line labels. They reject every ASCII control character, newline, tab and DEL included, checked on the text as sent, before trimming. Then they are trimmed and must be non-empty and within the limit.

No other Unicode filtering is applied. Bidirectional overrides, zero-width characters and combining marks are accepted, in chat text and in names.

`sentAt` is epoch MILLISECONDS on the SERVER clock, a non-negative safe integer.

### Worst-case size

The largest `room.state` the schema allows is `ROOM_MEMBERS_MAX` members with maximum-length ids and names, plus a `CatalogMedia` with every field at its `MEDIA_LIMITS` maximum. A test builds it two ways and checks both against the caps:

| Text                                                                      | Size, in bytes | Against `MAX_CLIENT_MESSAGE_BYTES` (65,536) | Against `MAX_SERVER_MESSAGE_BYTES` (262,144) |
| ------------------------------------------------------------------------- | -------------- | ------------------------------------------- | -------------------------------------------- |
| ASCII                                                                     | 42,947         | Under                                       | Under                                        |
| Every free-text field and every id filled with 4-byte characters          | 149,207        | Over                                        | Under                                        |

In the 4-byte case the parts the schema limits to ASCII stay ASCII: the `providerId` slug, the `https://example.com/` start of each url, the role and the dates. A code point is at most 4 bytes and a JSON escape such as `\"` is 2, so 4-byte characters are the worst case for size. The test also checks that `parseMessage` accepts the 4-byte message with the server events and refuses it with the client events, which is the reason there are two caps.

## Error codes

Sent by the server as the `error` event (server direction): `payload: { code, message, replyTo? }`.

| Code                  | Meaning and when the server sends it                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_json`        | Not JSON, or not a JSON object.                                                                                                                            |
| `message_too_large`   | Over the size cap for the direction: `MAX_CLIENT_MESSAGE_BYTES` for a client message.                                                                      |
| `unsupported_version` | `v` is not in `SUPPORTED_VERSIONS`.                                                                                                                        |
| `unknown_type`        | `type` is not a known event.                                                                                                                               |
| `invalid_payload`     | Right type, wrong shape.                                                                                                                                   |
| `not_a_member`        | The message parsed, but the user is not a member of the couch it names. Sent in answer to `room.join`.                                                     |
| `not_joined`          | The message parsed, but this connection has not joined a couch and the message needs one, such as `chat.send`, `room.setMedia` or a playback command.      |
| `forbidden`           | The connection is in a couch, but the user's role does not allow the action. For example a participant sends `room.setMedia` or `room.kick`.              |
| `couch_not_found`     | `room.join` names a couch that does not exist.                                                                                                             |
| `media_unavailable`   | `room.setMedia` names media that is not in the catalog, or that cannot be played right now.                                                                |
| `already_joined`      | `room.join` on a connection that has already joined, or is joining, a couch. A connection is in at most one room, and the join is refused, never moved.    |

The first five come from `parseMessage` (`PARSE_ERROR_CODES`). The rest are sent after a message parsed, when the server cannot act on it. New codes are added to `ERROR_CODES`. Never rename or remove a code.

On the wire, `code` is any non-empty string of at most `MAX_ERROR_CODE_LENGTH` (64) characters, not a strict enum. A client built before a new code was added therefore still parses the `error` message instead of rejecting it as `invalid_payload`. A client MUST treat a code it does not know as a generic error: show or log the message and carry on.

`isKnownErrorCode(code)` is a type guard that narrows a `string` to `ErrorCode`:

```ts
if (isKnownErrorCode(payload.code)) {
  // payload.code is an ErrorCode here: handle it specifically
} else {
  // A code from a newer server: treat it as a generic error
}
```

The inferred type of `code` still lists the known codes, so editors offer them as completions. The failures `parseMessage` itself returns are typed with the strict `ParseErrorCode` union (the first five codes), since this package only ever produces those. `errorCodeSchema` remains a strict enum, for code that validates a code it produces.
