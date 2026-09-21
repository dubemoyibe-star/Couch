import * as z from "zod";
import { defineEvent, idSchema } from "./envelope";

/** Stable error codes. Add new codes here; never rename or remove one. */
export const ERROR_CODES = [
  "invalid_json",
  "message_too_large",
  "unsupported_version",
  "unknown_type",
  "invalid_payload",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Strict: accepts only the codes this build knows. The `error` event itself is more tolerant. */
export const errorCodeSchema = z.enum(ERROR_CODES);

/** Longest `code` the `error` event accepts, in characters. */
export const MAX_ERROR_CODE_LENGTH = 64;

/** True when `code` is one of the codes in `ERROR_CODES`. Narrows the type to `ErrorCode`. */
export function isKnownErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The `code` of a received `error` message: any non-empty string, so a code added after this
 * client was built does not make the whole message invalid. The cast is type-only. It keeps
 * editor autocomplete for the known codes while the runtime check accepts any string, and
 * `string & Record<never, never>` stops the union from collapsing to plain `string`.
 */
const errorCodeOnTheWire = z
  .string()
  .min(1)
  .max(MAX_ERROR_CODE_LENGTH) as z.ZodType<ErrorCode | (string & Record<never, never>)>;

/**
 * Server to client. `replyTo` is the `id` of the client message that caused the error. A
 * client must treat a `code` it does not know (see `isKnownErrorCode`) as a generic error.
 */
export const errorEvent = defineEvent({
  type: "error",
  direction: "server",
  payload: {
    code: errorCodeOnTheWire,
    message: z.string(),
    replyTo: idSchema.optional(),
  },
});
