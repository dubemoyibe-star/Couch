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

export const errorCodeSchema = z.enum(ERROR_CODES);

/** Server to client. `replyTo` is the `id` of the client message that caused the error. */
export const errorEvent = defineEvent({
  type: "error",
  direction: "server",
  payload: {
    code: errorCodeSchema,
    message: z.string(),
    replyTo: idSchema.optional(),
  },
});
