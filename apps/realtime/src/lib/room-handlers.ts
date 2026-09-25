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
  listMembers,
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
  // Called with an unexpected failure while handling a message. The message is
  // dropped and the connection is left as it was.
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
};

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
      const { firstForUser } = connections.attach(connection, couchId, userId);

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
    }
  }

  return {
    onMessage(identity, message, connection) {
      if (message.type !== "room.join") return;
      void join(identity.userId, message.payload.couchId, message.id, connection);
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
