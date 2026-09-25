import type { PlaybackState } from "@couch/contracts";

/**
 * What the server knows about one couch that has media: the media being watched and its
 * playback state. A couch with no media has no room. Live connections and who is online
 * are not part of this: they hold sockets, so they belong to the realtime service.
 */
export type RoomState = {
  couchId: string;
  /** Catalog id of the current media. */
  mediaId: string;
  playback: PlaybackState;
};

/**
 * Storage for room state, keyed by couch id. Synchronous, because the only implementation
 * is in memory. Rooms live for the life of the process, so there is no eviction or delete.
 */
export interface RoomStore {
  /** The room for a couch, or undefined when it has none. */
  get(couchId: string): RoomState | undefined;
  /** Create the room or replace it, keyed by `room.couchId`. */
  set(room: RoomState): void;
}

/** A Map-backed {@link RoomStore}. Rooms are stored as given and returned as stored. */
export function createInMemoryRoomStore(): RoomStore {
  const rooms = new Map<string, RoomState>();
  return {
    get: (couchId) => rooms.get(couchId),
    set: (room) => {
      rooms.set(room.couchId, room);
    },
  };
}
