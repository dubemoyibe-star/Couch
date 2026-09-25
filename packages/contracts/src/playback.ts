import * as z from "zod";
import { defineEvent, type MessageOf } from "./envelope";

/**
 * Sanity cap for a playback position, in SECONDS (24 hours). It only rejects garbage on
 * the wire. The server clamps a position to the real media duration, which this package
 * does not know.
 */
export const PLAYBACK_POSITION_MAX_SECONDS = 86_400;

/** Slowest accepted playback rate, as a multiplier of normal speed (1 is normal). */
export const PLAYBACK_RATE_MIN = 0.5;

/**
 * Fastest accepted playback rate, as a multiplier of normal speed. The 0.5 to 2 range is
 * what every mainstream player offers and keeps position extrapolation between syncs
 * accurate. Both bounds are inclusive.
 */
export const PLAYBACK_RATE_MAX = 2.0;

// Zod 4 numbers already reject NaN and Infinity, and .int() rejects values outside the
// safe integer range, so no explicit finite or safe checks are needed.

/** A position in SECONDS from the start of the media. Finite, 0 to the sanity cap. */
const positionSchema = z.number().min(0).max(PLAYBACK_POSITION_MAX_SECONDS);

/** A rate as a multiplier of normal speed, within the inclusive rate bounds. */
const rateSchema = z.number().min(PLAYBACK_RATE_MIN).max(PLAYBACK_RATE_MAX);

/**
 * Who may send the playback transport commands (play, pause, seek, setRate): every member
 * (`"open"`, the default) or only the host (`"host"`). It does not affect `room.setMedia` or
 * `room.kick`, which are always host only.
 */
export const PLAYBACK_ACCESS_MODES = ["open", "host"] as const;

export type PlaybackAccessMode = (typeof PLAYBACK_ACCESS_MODES)[number];

export const playbackAccessModeSchema = z.enum(PLAYBACK_ACCESS_MODES);

/**
 * The playback state of a room, as the server knows it. Standalone so other server
 * messages can embed it. It carries no media id: media belongs to room state.
 *
 * Unknown keys are stripped, in line with the rule for server messages.
 */
export const playbackStateSchema = z.object({
  /** Whether the media is advancing. */
  status: z.enum(["playing", "paused"]),
  /** SECONDS from the start of the media, as of `serverTimestamp`. */
  position: positionSchema,
  /** Multiplier of normal speed: 1 is normal, 0.5 is half speed, 2 is double. */
  playbackRate: rateSchema,
  /** Unitless counter, incremented by the server on every state change. */
  revision: z.number().int().min(0),
  /** Epoch MILLISECONDS on the SERVER clock at which `position` was true. */
  serverTimestamp: z.number().int().min(0),
});

export type PlaybackState = z.infer<typeof playbackStateSchema>;

/**
 * Client to server: start or resume playback. `position` is the client-reported position in
 * SECONDS. The server validates it and stays authoritative.
 */
export const playbackPlayEvent = defineEvent({
  type: "playback.play",
  direction: "client",
  payload: { position: positionSchema },
});

/** Client to server: pause playback. `position` is the client-reported position in SECONDS. */
export const playbackPauseEvent = defineEvent({
  type: "playback.pause",
  direction: "client",
  payload: { position: positionSchema },
});

/** Client to server: jump to `position`, in SECONDS from the start of the media. */
export const playbackSeekEvent = defineEvent({
  type: "playback.seek",
  direction: "client",
  payload: { position: positionSchema },
});

/** Client to server: change the playback speed. `rate` is a multiplier of normal speed. */
export const playbackSetRateEvent = defineEvent({
  type: "playback.setRate",
  direction: "client",
  payload: { rate: rateSchema },
});

/**
 * Client to server: change who may send playback transport commands. Only a host may send
 * it. The contract only shapes the message: the server enforces the role and answers a
 * non-host with the `forbidden` error code.
 */
export const playbackSetAccessEvent = defineEvent({
  type: "playback.setAccess",
  direction: "client",
  payload: { mode: playbackAccessModeSchema },
});

/**
 * Server to client: the playback access mode changed. Broadcast to the room when the host
 * changes it. A client that joins later learns the mode from `room.state.playbackAccess`.
 */
export const playbackAccessChangedEvent = defineEvent({
  type: "playback.accessChanged",
  direction: "server",
  payload: { mode: playbackAccessModeSchema },
});

/**
 * Server to client: the authoritative playback state. A client discards a sync whose
 * `revision` is lower than the one it holds and treats an equal revision as idempotent.
 */
export const playbackSyncEvent = defineEvent({
  type: "playback.sync",
  direction: "server",
  payload: { state: playbackStateSchema },
});

/** Every playback event the server accepts, in the shape parseMessage takes. */
export const playbackClientEvents = [
  playbackPlayEvent,
  playbackPauseEvent,
  playbackSeekEvent,
  playbackSetRateEvent,
  playbackSetAccessEvent,
] as const;

/** Every playback event a client accepts, in the shape parseMessage takes. */
export const playbackServerEvents = [playbackSyncEvent, playbackAccessChangedEvent] as const;

export type PlaybackPlay = MessageOf<typeof playbackPlayEvent>;
export type PlaybackPause = MessageOf<typeof playbackPauseEvent>;
export type PlaybackSeek = MessageOf<typeof playbackSeekEvent>;
export type PlaybackSetRate = MessageOf<typeof playbackSetRateEvent>;
export type PlaybackSetAccess = MessageOf<typeof playbackSetAccessEvent>;
export type PlaybackAccessChanged = MessageOf<typeof playbackAccessChangedEvent>;
export type PlaybackSync = MessageOf<typeof playbackSyncEvent>;
export type PlaybackClientMessage = MessageOf<(typeof playbackClientEvents)[number]>;
export type PlaybackServerMessage = MessageOf<(typeof playbackServerEvents)[number]>;
