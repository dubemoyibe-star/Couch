import * as z from "zod";
import { defineEvent, type MessageOf } from "./envelope";
import { singleLineText, trimmedText } from "./fields";
import { catalogMediaWireSchema } from "./media";
import { playbackStateSchema } from "./playback";
import {
  couchIdSchema,
  displayNameSchema,
  mediaIdSchema,
  roleSchema,
  userIdSchema,
} from "./identity";

/**
 * Longest couch name, in Unicode code points, counted after trimming. A couch name is a
 * single-line label, so it rejects ASCII control characters, newline and tab included.
 */
export const COUCH_NAME_MAX_LENGTH = 100;

/** Most members a `room.state` snapshot carries. */
export const ROOM_MEMBERS_MAX = 100;

/** Longest `room.kicked` reason, in Unicode code points, counted after trimming. */
export const KICK_REASON_MAX_LENGTH = 200;

/** One member of a couch, as listed in `room.state`. */
export const roomMemberSchema = z.object({
  userId: userIdSchema,
  displayName: displayNameSchema,
  role: roleSchema,
  /** Whether the member has at least one open connection. Derived by the server. */
  online: z.boolean(),
});

export type RoomMember = z.infer<typeof roomMemberSchema>;

/** Client to server: join a couch. The user is the authenticated connection. */
export const roomJoinEvent = defineEvent({
  type: "room.join",
  direction: "client",
  payload: { couchId: couchIdSchema },
});

/** Client to server: leave the couch this connection joined. */
export const roomLeaveEvent = defineEvent({
  type: "room.leave",
  direction: "client",
  payload: {},
});

/**
 * Client to server: change the media the room is watching. Host only. The contract only
 * shapes the message. The server enforces the role.
 */
export const roomSetMediaEvent = defineEvent({
  type: "room.setMedia",
  direction: "client",
  payload: { mediaId: mediaIdSchema },
});

/**
 * Client to server: remove a member from the room. Host only, enforced by the server.
 * `userId` names the member to remove, never the sender.
 */
export const roomKickEvent = defineEvent({
  type: "room.kick",
  direction: "client",
  payload: { userId: userIdSchema },
});

/**
 * Server to client: the full room snapshot, sent on join and on reconnect.
 *
 * Invariant: `media` is null exactly when `playback` is null. It is deliberately not a
 * schema refinement. A server bug that breaks it should not make the client drop the whole
 * snapshot, so the client decides how to render a mismatch.
 */
export const roomStateEvent = defineEvent({
  type: "room.state",
  direction: "server",
  payload: {
    couch: z.object({ id: couchIdSchema, name: singleLineText(COUCH_NAME_MAX_LENGTH) }),
    self: z.object({ userId: userIdSchema, role: roleSchema }),
    members: z.array(roomMemberSchema).max(ROOM_MEMBERS_MAX),
    media: catalogMediaWireSchema.nullable(),
    playback: playbackStateSchema.nullable(),
  },
});

/** Server to client: the room switched to another media item and its playback state. */
export const roomMediaChangedEvent = defineEvent({
  type: "room.mediaChanged",
  direction: "server",
  payload: { media: catalogMediaWireSchema, playback: playbackStateSchema },
});

/**
 * Server to client: someone became a member of the room. Sent to the members already in
 * it. A member who joins receives `room.state` instead, which already lists them.
 */
export const roomMemberJoinedEvent = defineEvent({
  type: "room.memberJoined",
  direction: "server",
  payload: { member: roomMemberSchema },
});

/**
 * Server to client: a member was removed from the room for good, because they left or were
 * kicked. A member who only disconnects is not removed: that is a `presence.update`.
 */
export const roomMemberLeftEvent = defineEvent({
  type: "room.memberLeft",
  direction: "server",
  payload: { userId: userIdSchema },
});

/**
 * Server to client: a connection change of an EXISTING member, online or offline. It is
 * derived from connections. It never announces a new or removed member: see
 * `room.memberJoined` and `room.memberLeft`.
 */
export const presenceUpdateEvent = defineEvent({
  type: "presence.update",
  direction: "server",
  payload: { userId: userIdSchema, online: z.boolean() },
});

/** Server to client: the recipient was removed from the room. `reason` is optional. */
export const roomKickedEvent = defineEvent({
  type: "room.kicked",
  direction: "server",
  payload: { reason: trimmedText(KICK_REASON_MAX_LENGTH).optional() },
});

/** Every room event the server accepts, in the shape parseMessage takes. */
export const roomClientEvents = [
  roomJoinEvent,
  roomLeaveEvent,
  roomSetMediaEvent,
  roomKickEvent,
] as const;

/** Every room and presence event a client accepts, in the shape parseMessage takes. */
export const roomServerEvents = [
  roomStateEvent,
  roomMediaChangedEvent,
  roomMemberJoinedEvent,
  roomMemberLeftEvent,
  presenceUpdateEvent,
  roomKickedEvent,
] as const;

export type RoomJoin = MessageOf<typeof roomJoinEvent>;
export type RoomLeave = MessageOf<typeof roomLeaveEvent>;
export type RoomSetMedia = MessageOf<typeof roomSetMediaEvent>;
export type RoomKick = MessageOf<typeof roomKickEvent>;
export type RoomState = MessageOf<typeof roomStateEvent>;
export type RoomMediaChanged = MessageOf<typeof roomMediaChangedEvent>;
export type RoomMemberJoined = MessageOf<typeof roomMemberJoinedEvent>;
export type RoomMemberLeft = MessageOf<typeof roomMemberLeftEvent>;
export type PresenceUpdate = MessageOf<typeof presenceUpdateEvent>;
export type RoomKicked = MessageOf<typeof roomKickedEvent>;
