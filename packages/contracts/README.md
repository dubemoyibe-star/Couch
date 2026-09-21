# @couch/contracts

Wire schemas and the types derived from them. This is the validation boundary for all external input. It depends only on `zod` and runs in the browser and in Node.

This package defines the envelope every realtime message uses, how messages are named and versioned, and how raw input is parsed safely. It defines no concrete room, playback or chat event yet; later issues declare those with `defineEvent`.

## Envelope

Every message is one JSON object:

```json
{ "v": 1, "type": "chat.send", "id": "c-42", "payload": { } }
```

| Field | Meaning |
| --- | --- |
| `v` | Protocol version. `1` today. |
| `type` | Event name, `domain.action`. Selects the payload schema. |
| `id` | Optional client-generated correlation id, 1 to 64 characters (`MAX_ID_LENGTH`). |
| `payload` | Always an object, so it can gain optional fields later. |

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

| Direction | Sender | Unknown keys | Why |
| --- | --- | --- | --- |
| `client` | client to server | Rejected, at the envelope and payload level | The sender is untrusted. The server must not accept noise, and an unknown key is a sign of a bug or an attack. |
| `server` | server to client | Stripped | The server is trusted and evolves first. Stripping means an additive server change (a new field) never breaks an older client. |

An unknown `type` from the server is reported as `unknown_type`, so a client can ignore it and carry on. Strictness is decided by the event's direction, which the definition carries.

## Naming

- `type` is `domain.action`: lowercase, one dot, letters and digits (`room.join`, `playback.seek`, `chat.send`). `defineEvent` throws at definition time if the name does not match.
- The one exception is the reserved type `error`.
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
- A new `ErrorCode` (see the caveat below).

Clients that receive a `v` they do not support get `unsupported_version` before any other check, so a future payload shape is never misreported as `invalid_payload`.

## Parsing

`parseMessage(raw, events)` returns `{ ok: true, data }` or `{ ok: false, error }`. It never throws on bad input. `error` is `{ code, message, replyTo? }`: a stable code, a fixed safe message (it never echoes input), and the correlation id when there is one.

`events` is the list of definitions this side accepts: the client events on the server, the server events on a client. The known types are read from that same list and each definition's `envelope` schema validates the payload, so there is no second list of types to keep in sync.

Stages run in this order and the first failure wins:

| # | Check | Failure code |
| --- | --- | --- |
| 1 | Size in UTF-8 bytes is at most `MAX_MESSAGE_BYTES` (64 KiB). Measured in bytes, not string length. | `message_too_large` |
| 2 | Valid JSON. | `invalid_json` |
| 3 | Top level is a plain object. Arrays, `null` and scalars are `invalid_json`: they are not a message, and a separate code would add nothing a client can act on. | `invalid_json` |
| 4 | `v` is a supported version. A missing or non-numeric `v` counts as unsupported. | `unsupported_version` |
| 5 | `type` is one of the known types. | `unknown_type` |
| 6 | The envelope schema, including the payload, `id` and unknown-key rules. | `invalid_payload` |

`invalid_payload` therefore also covers a bad envelope field (an over-long `id`, or an extra top-level key on a client message).

`replyTo` is set on failures after step 3 when the message has an `id` that is a string of 1 to 64 characters. Otherwise it is absent. Failures at steps 1 to 3 never carry it.

The byte count uses a small pure function (`utf8ByteLength`) instead of `TextEncoder` or `Buffer`, because this package's TypeScript config exposes neither DOM nor Node globals. A test checks it against `TextEncoder`.

## Error codes

Sent by the server as the `error` event (server direction): `payload: { code, message, replyTo? }`.

| Code | Meaning |
| --- | --- |
| `invalid_json` | Not JSON, or not a JSON object. |
| `message_too_large` | Over `MAX_MESSAGE_BYTES`. |
| `unsupported_version` | `v` is not in `SUPPORTED_VERSIONS`. |
| `unknown_type` | `type` is not a known event. |
| `invalid_payload` | Right type, wrong shape. |

Later issues extend `ERROR_CODES`. Never rename or remove a code.

Caveat: `code` is a strict enum, so a client built before a new code was added rejects that `error` message as `invalid_payload`. Clients should treat any failure to parse an `error` message as a generic error.
