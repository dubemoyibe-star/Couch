import * as z from "zod";
import { defineEvent, type MessageOf } from "./envelope";
import { displayNameSchema, userIdSchema } from "./identity";
import { opaqueId } from "./fields";

/**
 * Longest chat message, in Unicode code points, counted after trimming. This is how Zod
 * measures string length, so an emoji counts as 1 and not as the 2 UTF-16 units that
 * `string.length` reports. In UTF-8 a code point takes 1 to 4 bytes.
 */
export const CHAT_MAX_LENGTH = 500;

/** Longest chat message id, in Unicode code points. */
export const CHAT_MESSAGE_ID_MAX_LENGTH = 128;

/** True when `text` has a C0 control character (U+0000 to U+001F) other than newline (U+000A). */
function hasDisallowedControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit <= 0x1f && unit !== 0x0a) return true;
  }
  return false;
}

/**
 * The text of a chat message. The control character check runs on the text as sent, before
 * trimming, so a stray tab or carriage return at the edge is rejected and not silently
 * trimmed away. Only newline is allowed. The value is then trimmed, must be non-empty, and
 * must be at most `CHAT_MAX_LENGTH`.
 */
export const chatTextSchema = z
  .string()
  .refine((text) => !hasDisallowedControl(text), {
    error: "text must not contain control characters other than newline",
  })
  .trim()
  .min(1)
  .max(CHAT_MAX_LENGTH);

/**
 * Client to server: send a chat message to the room. The sender is the authenticated
 * connection, and the server assigns the id and the time.
 */
export const chatSendEvent = defineEvent({
  type: "chat.send",
  direction: "client",
  payload: { text: chatTextSchema },
});

/**
 * Server to client: a chat message. `sentAt` is epoch MILLISECONDS on the SERVER clock, a
 * non-negative safe integer.
 */
export const chatMessageEvent = defineEvent({
  type: "chat.message",
  direction: "server",
  payload: {
    id: opaqueId(CHAT_MESSAGE_ID_MAX_LENGTH),
    userId: userIdSchema,
    displayName: displayNameSchema,
    text: chatTextSchema,
    sentAt: z.number().int().min(0),
  },
});

/** Every chat event the server accepts, in the shape parseMessage takes. */
export const chatClientEvents = [chatSendEvent] as const;

/** Every chat event a client accepts, in the shape parseMessage takes. */
export const chatServerEvents = [chatMessageEvent] as const;

export type ChatSend = MessageOf<typeof chatSendEvent>;
export type ChatMessage = MessageOf<typeof chatMessageEvent>;
