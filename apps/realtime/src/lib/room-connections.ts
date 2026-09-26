// Which connections are attached to which room, and who is therefore online.
// It holds no sockets of its own: a connection is any object the caller passes,
// so it runs in unit tests without a network. Presence is derived from it, never
// stored: a user is online in a room while at least one of their connections is
// attached to that room.
//
// A connection is in at most one room at a time. `begin` claims the connection
// before any asynchronous work, so a second join that arrives while the first is
// still being resolved is refused instead of racing it.

type Role = "host" | "participant";
type Attachment = { couchId: string; userId: string; role: Role };

export type Detached = {
  readonly couchId: string;
  readonly userId: string;
  // True when this was the user's last attached connection in that room.
  readonly wasLast: boolean;
};

export type RoomConnections<C extends object> = {
  // Claims the connection for a join. False when it is already attached to a
  // room, is joining one, or has closed.
  begin(connection: C): boolean;
  // Releases a claim that did not end in an attach (the join failed).
  abort(connection: C): void;
  // False when the connection closed while the join was being resolved.
  isOpen(connection: C): boolean;
  // Attaches a claimed connection. `firstForUser` is true when no other
  // connection of that user was in the room.
  // `role` is the member's role when they joined, kept as the room's cached
  // membership. It is a first check only: the database decides.
  attach(connection: C, couchId: string, userId: string, role: Role): { firstForUser: boolean };
  // The room, user and cached role this connection is attached to, or null.
  attachment(connection: C): { couchId: string; userId: string; role: Role } | null;
  // Detaches every connection of the user in the room, and returns them. They
  // stay open and may join again. Used when the user stops being a member.
  detachUser(couchId: string, userId: string): C[];
  // Detaches every connection in the room, whoever they are, and returns them.
  // They stay open. Used when the couch itself is gone.
  detachRoom(couchId: string): C[];
  // Removes the connection, whether attached, joining, or neither, and marks it
  // closed. Returns what it was attached to, or null.
  close(connection: C): Detached | null;
  isOnline(couchId: string, userId: string): boolean;
  // Every attached connection in the room except `except`.
  peers(couchId: string, except?: C): C[];
};

export function createRoomConnections<C extends object>(): RoomConnections<C> {
  const claimed = new Set<C>();
  const closed = new WeakSet<C>();
  const attachments = new Map<C, Attachment>();
  // couchId -> userId -> that user's attached connections in the room.
  const rooms = new Map<string, Map<string, Set<C>>>();

  return {
    begin(connection) {
      if (closed.has(connection) || claimed.has(connection)) return false;
      claimed.add(connection);
      return true;
    },

    abort(connection) {
      if (!attachments.has(connection)) claimed.delete(connection);
    },

    isOpen: (connection) => !closed.has(connection),

    attach(connection, couchId, userId, role) {
      let users = rooms.get(couchId);
      if (!users) rooms.set(couchId, (users = new Map()));
      let set = users.get(userId);
      const firstForUser = !set || set.size === 0;
      if (!set) users.set(userId, (set = new Set()));
      set.add(connection);
      attachments.set(connection, { couchId, userId, role });
      return { firstForUser };
    },

    attachment: (connection) => attachments.get(connection) ?? null,

    detachUser(couchId, userId) {
      const users = rooms.get(couchId);
      const detached = [...(users?.get(userId) ?? [])];
      for (const connection of detached) {
        attachments.delete(connection);
        claimed.delete(connection);
      }
      users?.delete(userId);
      if (users && users.size === 0) rooms.delete(couchId);
      return detached;
    },

    detachRoom(couchId) {
      const detached: C[] = [];
      for (const set of rooms.get(couchId)?.values() ?? []) {
        for (const connection of set) {
          attachments.delete(connection);
          claimed.delete(connection);
          detached.push(connection);
        }
      }
      rooms.delete(couchId);
      return detached;
    },

    close(connection) {
      closed.add(connection);
      claimed.delete(connection);
      const attachment = attachments.get(connection);
      if (!attachment) return null;
      attachments.delete(connection);
      const users = rooms.get(attachment.couchId);
      const set = users?.get(attachment.userId);
      set?.delete(connection);
      const wasLast = !set || set.size === 0;
      if (wasLast) users?.delete(attachment.userId);
      if (users && users.size === 0) rooms.delete(attachment.couchId);
      return { couchId: attachment.couchId, userId: attachment.userId, wasLast };
    },

    isOnline: (couchId, userId) => (rooms.get(couchId)?.get(userId)?.size ?? 0) > 0,

    peers(couchId, except) {
      const result: C[] = [];
      for (const set of rooms.get(couchId)?.values() ?? []) {
        for (const connection of set) if (connection !== except) result.push(connection);
      }
      return result;
    },
  };
}
