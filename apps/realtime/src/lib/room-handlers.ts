import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type PlaybackAccessMode,
  type PlaybackState,
  type RoomMember,
  type ServerMessage,
} from "@couch/contracts";
import {
  getCatalogMedia,
  getCouch,
  getMembership,
  leaveCouch,
  listMembers,
  removeMember,
  setCurrentMedia,
  type PrismaClient,
} from "@couch/database";
import {
  applyPause,
  applyPlay,
  applySeek,
  applySetRate,
  createInitialPlaybackState,
  type RoomStore,
} from "@couch/shared";
import { createRoomConnections } from "./room-connections";
import type { Authenticated, Connection } from "./server";

export type RoomHandlerDeps = {
  db: PrismaClient;
  store: RoomStore;
  // Epoch milliseconds on the server clock. Injected so nothing here reads one.
  now: () => number;
  // Called with an unexpected failure while handling a message. The client is
  // answered with `internal_error` and the connection is left as it was.
  onError?: (error: unknown) => void;
};

export type RoomHandlers = {
  onMessage(identity: Authenticated, message: ClientMessage, connection: Connection): void;
  onClose(connection: Connection): void;
  // Tears down a couch's live room because the couch no longer exists.
  teardown(couchId: string): void;
};

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  not_a_member: "You are not a member of this couch.",
  couch_not_found: "This couch does not exist.",
  already_joined: "This connection has already joined a couch.",
  internal_error: "The server could not complete the request.",
  not_joined: "This connection has not joined a couch.",
  forbidden: "Only the host can do that.",
  media_unavailable: "This couch has no media to control.",
  host_cannot_leave: "As the host, you cannot leave this couch.",
  cannot_remove_self: "You cannot remove yourself from the couch.",
  unknown_type: "This message type is not supported yet.",
};

// 1008: policy violation. The user was removed from the only room the socket
// could be in, so the socket has no further purpose.
const CLOSE_REMOVED = 1008;
// 1000: normal closure. The couch was deleted, so the room ended and nothing went wrong.
const CLOSE_ROOM_DELETED = 1000;

function sendError(connection: Connection, code: ErrorCode, replyTo: string | undefined): void {
  connection.send({
    v: PROTOCOL_VERSION,
    type: "error",
    payload: { code, message: ERROR_MESSAGES[code] ?? code, ...(replyTo === undefined ? {} : { replyTo }) },
  });
}

// Room membership and presence. One connection is in at most one room: a
// second `room.join` on a connection that is joined, or is still joining, is
// refused with `already_joined`. It never moves the connection. Presence is
// derived from the attached connections, so a raw disconnect updates it without
// a `room.leave`.
//
// `room.leave` and `room.kick` remove the membership row, then detach every
// connection the user has in that room, whichever connection asked. The others
// in the room get one `room.memberLeft` per event, however many connections
// the user had. A leaver's connections all receive `room.memberLeft` naming
// themselves, which tells each tab it is out (their sockets stay open and may
// join again). A kicked user's connections receive `room.kicked` and their
// sockets are closed.
export function createRoomHandlers(deps: RoomHandlerDeps): RoomHandlers {
  const connections = createRoomConnections<Connection>();

  function broadcast(couchId: string, message: ServerMessage, except?: Connection): void {
    for (const peer of connections.peers(couchId, except)) peer.send(message);
  }

  async function join(userId: string, couchId: string, replyTo: string | undefined, connection: Connection) {
    if (!connections.begin(connection)) return sendError(connection, "already_joined", replyTo);
    try {
      // Identity is the authenticated connection's, never the payload's.
      const membership = await getMembership(deps.db, { couchId, userId });
      if (!membership) {
        connections.abort(connection);
        return sendError(connection, "not_a_member", replyTo);
      }
      const couch = await getCouch(deps.db, couchId);
      if (!couch) {
        connections.abort(connection);
        return sendError(connection, "couch_not_found", replyTo);
      }
      const members = await listMembers(deps.db, couchId);
      // Re-resolved through the license gate: a stored id is never trusted, and
      // a taken-down item comes back null, the same as no media.
      const media = couch.currentMediaId
        ? await getCatalogMedia(deps.db, couch.currentMediaId, {
            onExcluded: (exclusion) => deps.onError?.(new Error(`excluded ${exclusion.id} (${exclusion.reason})`)),
          })
        : null;

      // The connection closed while the lookups ran. Nothing is attached.
      if (!connections.isOpen(connection)) return;
      const self = members.find((member) => member.userId === userId);
      if (!self) {
        connections.abort(connection);
        return sendError(connection, "not_a_member", replyTo);
      }

      // From here to the end there is no await, so the snapshot and the
      // broadcast see the same set of attached connections.
      const { firstForUser } = connections.attach(connection, couchId, userId, self.role);

      let playback = null;
      // A couch that never had media has no room, so it is open until one exists.
      // A cleared couch keeps its room, and so its mode.
      let playbackAccess: PlaybackAccessMode = deps.store.get(couchId)?.playbackAccess ?? "open";
      if (media) {
        // The room is created on first use. The database decides which media a
        // couch has, so a stored room for other media is replaced.
        // A new room is open. Replacing one for other media keeps its access mode.
        let room = deps.store.get(couchId);
        if (!room || room.mediaId !== media.id) {
          room = {
            couchId,
            mediaId: media.id,
            playback: createInitialPlaybackState(deps.now()),
            playbackAccess: room?.playbackAccess ?? "open",
          };
          deps.store.set(room);
        }
        playback = room.playback;
        playbackAccess = room.playbackAccess;
      }

      const roster: RoomMember[] = members.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        role: member.role,
        online: connections.isOnline(couchId, member.userId),
      }));
      connection.send({
        v: PROTOCOL_VERSION,
        type: "room.state",
        payload: {
          couch: { id: couch.id, name: couch.name },
          self: { userId, role: self.role },
          members: roster,
          media,
          playback,
          playbackAccess,
        },
      });

      // A user already present through another connection only changed their
      // connection count. Only their first connection announces a new member.
      if (firstForUser) {
        const member = roster.find((each) => each.userId === userId);
        if (member) broadcast(couchId, { v: PROTOCOL_VERSION, type: "room.memberJoined", payload: { member } }, connection);
      } else {
        broadcast(couchId, { v: PROTOCOL_VERSION, type: "presence.update", payload: { userId, online: true } }, connection);
      }
    } catch (error) {
      connections.abort(connection);
      deps.onError?.(error);
      sendError(connection, "internal_error", replyTo);
    }
  }

  async function leave(userId: string, replyTo: string | undefined, connection: Connection) {
    // The room is the one this connection is attached to, never a payload.
    const attached = connections.attachment(connection);
    if (!attached) return sendError(connection, "not_joined", replyTo);
    const { couchId } = attached;
    try {
      const result = await leaveCouch(deps.db, { couchId, userId });
      if (!result.ok) return sendError(connection, result.error, replyTo);
      // No await from here on. The row is gone, so the user's connections are
      // detached by user id even if the asking one closed in the meantime.
      const message: ServerMessage = { v: PROTOCOL_VERSION, type: "room.memberLeft", payload: { userId } };
      const own = connections.detachUser(couchId, userId);
      broadcast(couchId, message);
      for (const each of own) each.send(message);
    } catch (error) {
      deps.onError?.(error);
      sendError(connection, "internal_error", replyTo);
    }
  }

  async function kick(actingUserId: string, targetUserId: string, replyTo: string | undefined, connection: Connection) {
    const attached = connections.attachment(connection);
    if (!attached) return sendError(connection, "not_joined", replyTo);
    // The cached role is a first check. The database re-checks it below.
    if (attached.role !== "host") return sendError(connection, "forbidden", replyTo);
    const { couchId } = attached;
    try {
      const result = await removeMember(deps.db, { couchId, actingUserId, targetUserId });
      if (!result.ok) return sendError(connection, result.error, replyTo);
      const targets = connections.detachUser(couchId, targetUserId);
      for (const target of targets) {
        target.send({ v: PROTOCOL_VERSION, type: "room.kicked", payload: {} });
        target.close(CLOSE_REMOVED, "removed from couch");
      }
      broadcast(couchId, { v: PROTOCOL_VERSION, type: "room.memberLeft", payload: { userId: targetUserId } });
    } catch (error) {
      deps.onError?.(error);
      sendError(connection, "internal_error", replyTo);
    }
  }

  function setAccess(mode: PlaybackAccessMode, replyTo: string | undefined, connection: Connection) {
    const attached = connections.attachment(connection);
    if (!attached) return sendError(connection, "not_joined", replyTo);
    // The role is the one cached at join, never anything from the payload.
    if (attached.role !== "host") return sendError(connection, "forbidden", replyTo);
    try {
      const room = deps.store.get(attached.couchId);
      // No media means no room, so there is nothing to control yet.
      if (!room?.playback) return sendError(connection, "media_unavailable", replyTo);
      deps.store.set({ ...room, playbackAccess: mode });
      // No `except`: the sender is attached too, so it gets the same message.
      broadcast(attached.couchId, { v: PROTOCOL_VERSION, type: "playback.accessChanged", payload: { mode } });
    } catch (error) {
      deps.onError?.(error);
      sendError(connection, "internal_error", replyTo);
    }
  }

  // The cached role is a first check. `setCurrentMedia` re-checks the host in the
  // database and owns the license gate, so nothing of it is repeated here. On any
  // failure nothing is stored or broadcast: only the requester is answered.
  async function setMedia(actingUserId: string, mediaId: string | null, replyTo: string | undefined, connection: Connection) {
    const attached = connections.attachment(connection);
    if (!attached) return sendError(connection, "not_joined", replyTo);
    if (attached.role !== "host") return sendError(connection, "forbidden", replyTo);
    const { couchId } = attached;
    try {
      const result = await setCurrentMedia(deps.db, { couchId, actingUserId, mediaId });
      if (!result.ok) return sendError(connection, result.error, replyTo);
      const media = mediaId ? await getCatalogMedia(deps.db, mediaId) : null;
      // Written a moment ago through the same gate, so a null here means a takedown
      // landed in between. The database now names media the room must not show.
      if (mediaId && !media) return sendError(connection, "media_unavailable", replyTo);

      // No await from here on. The mode is read now and written back, so a media
      // change never resets it.
      const playbackAccess = deps.store.get(couchId)?.playbackAccess ?? "open";
      const playback = media ? createInitialPlaybackState(deps.now()) : null;
      deps.store.set({ couchId, mediaId: media ? media.id : null, playback, playbackAccess });
      broadcast(couchId, { v: PROTOCOL_VERSION, type: "room.mediaChanged", payload: { media, playback } });
    } catch (error) {
      deps.onError?.(error);
      sendError(connection, "internal_error", replyTo);
    }
  }

  // Every transport command is judged and applied here, synchronously. Nothing
  // awaits between reading the room and storing the new state, so two commands
  // can never interleave: the single-threaded event loop runs each handler to
  // completion, one at a time, and each revision is built on the previous one.
  function transport(
    apply: (state: PlaybackState, now: number) => PlaybackState,
    replyTo: string | undefined,
    connection: Connection,
  ) {
    const attached = connections.attachment(connection);
    if (!attached) return sendError(connection, "not_joined", replyTo);
    try {
      // A missing room means the couch has no media.
      const room = deps.store.get(attached.couchId);
      if (!room?.playback) return sendError(connection, "media_unavailable", replyTo);
      if (attached.role !== "host" && room.playbackAccess !== "open") return sendError(connection, "forbidden", replyTo);
      const playback = apply(room.playback, deps.now());
      deps.store.set({ ...room, playback });
      const sync: ServerMessage = { v: PROTOCOL_VERSION, type: "playback.sync", payload: { state: playback } };
      broadcast(attached.couchId, sync);
    } catch (error) {
      deps.onError?.(error);
      sendError(connection, "internal_error", replyTo);
    }
  }

  return {
    onMessage(identity, message, connection) {
      if (message.type === "room.join") {
        void join(identity.userId, message.payload.couchId, message.id, connection);
      } else if (message.type === "room.leave") {
        void leave(identity.userId, message.id, connection);
      } else if (message.type === "room.kick") {
        void kick(identity.userId, message.payload.userId, message.id, connection);
      } else if (message.type === "room.setMedia") {
        void setMedia(identity.userId, message.payload.mediaId, message.id, connection);
      } else if (message.type === "playback.setAccess") {
        setAccess(message.payload.mode, message.id, connection);
      } else if (message.type === "playback.play") {
        transport((state, now) => applyPlay(state, message.payload, now), message.id, connection);
      } else if (message.type === "playback.pause") {
        transport((state, now) => applyPause(state, message.payload, now), message.id, connection);
      } else if (message.type === "playback.seek") {
        transport((state, now) => applySeek(state, message.payload, now), message.id, connection);
      } else if (message.type === "playback.setRate") {
        transport((state, now) => applySetRate(state, message.payload, now), message.id, connection);
      } else {
        // In the contracts catalog but with no handler yet (chat.send). Refused,
        // never silently dropped.
        sendError(connection, "unknown_type", message.id);
      }
    },

    // The one place a room is removed from the store. Rooms otherwise persist for the
    // life of the process, even with their media cleared, because the couch still
    // exists. Here the couch itself is gone, so keeping the room would keep state for
    // something that can never be joined again.
    //
    // Every connection attached to the couch is told and closed, whether or not a
    // room was ever stored: a couch that never had media has connections and no room.
    // Nothing here awaits, so no command can interleave. The detached connections
    // close later without announcing presence, because nobody is left to hear it.
    //
    // TODO: once local streaming exists, this teardown must also stop any active
    // LiveKit stream for the room, before the connections are closed.
    teardown(couchId) {
      const attached = connections.detachRoom(couchId);
      deps.store.delete(couchId);
      for (const connection of attached) {
        connection.send({ v: PROTOCOL_VERSION, type: "room.deleted", payload: {} });
        connection.close(CLOSE_ROOM_DELETED, "couch deleted");
      }
    },

    onClose(connection) {
      const detached = connections.close(connection);
      if (detached?.wasLast) {
        broadcast(detached.couchId, {
          v: PROTOCOL_VERSION,
          type: "presence.update",
          payload: { userId: detached.userId, online: false },
        });
      }
    },
  };
}
