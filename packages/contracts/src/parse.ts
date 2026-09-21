import { MAX_ID_LENGTH, SUPPORTED_VERSIONS, type AnyEvent, type MessageOf } from "./envelope";
import type { ErrorCode } from "./errors";

/** Largest accepted raw message, in UTF-8 bytes. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

export interface ParseError {
  code: ErrorCode;
  /** Fixed text per code. Never echoes input, so it is safe to send back. */
  message: string;
  /** The `id` of the offending message, when it had a usable one. */
  replyTo?: string;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: ParseError };

const MESSAGES: Record<ErrorCode, string> = {
  invalid_json: "Message is not a valid JSON object.",
  message_too_large: "Message exceeds the maximum size.",
  unsupported_version: "Unsupported protocol version.",
  unknown_type: "Unknown message type.",
  invalid_payload: "Message does not match the expected shape.",
};

/**
 * UTF-8 size of a string without TextEncoder or Buffer, which are not both available in
 * the browser and Node types. A lone surrogate counts as 3 bytes, as TextEncoder does
 * (it encodes it as U+FFFD).
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) {
      bytes += 1;
    } else if (unit < 0x800) {
      bytes += 2;
    } else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function fail(code: ErrorCode, replyTo?: string): { ok: false; error: ParseError } {
  const error: ParseError = { code, message: MESSAGES[code] };
  if (replyTo !== undefined) error.replyTo = replyTo;
  return { ok: false, error };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses one raw wire message. Never throws on bad input. The first failing stage wins:
 * size, JSON, top-level object, version, type, payload.
 *
 * `events` is the list of event definitions this side accepts (the client events on the
 * server, the server events on a client). The known types are read from that same list,
 * and each definition's envelope schema does the payload validation, so there is no
 * second list of types to keep in sync.
 */
export function parseMessage<TEvent extends AnyEvent>(
  raw: string,
  events: readonly TEvent[],
): ParseResult<MessageOf<TEvent>> {
  // 1. Size, in bytes. A UTF-16 unit is at least one byte, so length alone can reject early.
  if (typeof raw !== "string") return fail("invalid_json");
  if (raw.length > MAX_MESSAGE_BYTES || utf8ByteLength(raw) > MAX_MESSAGE_BYTES) {
    return fail("message_too_large");
  }

  // 2. JSON.
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("invalid_json");
  }

  // 3. Top level must be a plain object (arrays, null and scalars are invalid_json).
  if (!isPlainObject(json)) return fail("invalid_json");

  // From here on the message has an id we can echo back, if it is sane.
  const id = json.id;
  const replyTo =
    typeof id === "string" && id.length >= 1 && id.length <= MAX_ID_LENGTH ? id : undefined;

  // 4. Version, before type and payload so a future version is not misreported.
  if (typeof json.v !== "number" || !SUPPORTED_VERSIONS.includes(json.v)) {
    return fail("unsupported_version", replyTo);
  }

  // 5. Type, from the same definitions that validate the payload.
  const event = events.find((candidate) => candidate.type === json.type);
  if (event === undefined) return fail("unknown_type", replyTo);

  // 6. Payload (and the envelope's own fields, such as id and unknown keys).
  const result = event.envelope.safeParse(json);
  if (!result.success) return fail("invalid_payload", replyTo);
  return { ok: true, data: result.data as MessageOf<TEvent> };
}
