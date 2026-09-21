import type { MessageOf } from "./envelope";
import { chatClientEvents, chatServerEvents } from "./chat";
import { errorEvent } from "./errors";
import { playbackClientEvents, playbackServerEvents } from "./playback";
import { roomClientEvents, roomServerEvents } from "./room";

/**
 * Every message a client may send, in the shape parseMessage takes. This is the single
 * source of truth for the client to server catalog: the server parses with it.
 */
export const clientEvents = [
  ...roomClientEvents,
  ...chatClientEvents,
  ...playbackClientEvents,
] as const;

/**
 * Every message the server may send, including `error`, in the shape parseMessage takes.
 * This is the single source of truth for the server to client catalog: a client parses with
 * it.
 */
export const serverEvents = [
  ...roomServerEvents,
  ...chatServerEvents,
  ...playbackServerEvents,
  errorEvent,
] as const;

export type ClientMessage = MessageOf<(typeof clientEvents)[number]>;
export type ServerMessage = MessageOf<(typeof serverEvents)[number]>;
