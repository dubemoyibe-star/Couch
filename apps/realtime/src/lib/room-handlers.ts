import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
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
  type PrismaClient,
} from "@couch/database";
import { createInitialPlaybackState, type RoomStore } from "@couch/shared";
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
};

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  not_a_member: "You are not a member of this couch.",
  couch_not_found: "This couch does not exist.",
  already_joined: "This connection has already joined a couch.",
  internal_error: "The server could not complete the request.",
  not_joined: "This connection has not joined a couch.",
  forbidden: "Only the host can do that.",
  host_cannot_leave: "As the host, you cannot leave this couch.",
  cannot_remove_self: "You cannot remove yourself from the couch.",
};

// 1008: policy violation. The user was removed from the only room the socket
// could be in, so the socket has no further purpose.
const CLOSE_REMOVED = 1008;

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
      if (media) {
        // The room is created on first use. The database decides which media a
        // couch has, so a stored room for other media is replaced.
        let room = deps.store.get(couchId);
        if (!room || room.mediaId !== media.id) {
          room = { couchId, mediaId: media.id, playback: createInitialPlaybackState(deps.now()) };
          deps.store.set(room);
        }
        playback = room.playback;
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

  return {
    onMessage(identity, message, connection) {
      if (message.type === "room.join") {
        void join(identity.userId, message.payload.couchId, message.id, connection);
      } else if (message.type === "room.leave") {
        void leave(identity.userId, message.id, connection);
      } else if (message.type === "room.kick") {
        void kick(identity.userId, message.payload.userId, message.id, connection);
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
