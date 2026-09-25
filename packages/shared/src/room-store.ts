import type { PlaybackAccessMode, PlaybackState } from "@couch/contracts";

/**
 * What the server knows about one couch: the media being watched, its playback state, and
 * the playback access mode. `mediaId` is null exactly when `playback` is null: a couch whose
 * media was cleared keeps its room so the access mode survives. A couch that never had
 * media has no room. Live connections and who is online are not part of this: they hold
 * sockets, so they belong to the realtime service.
 */
export type RoomState = {
  couchId: string;
  /** Catalog id of the current media, or null when it was cleared. */
  mediaId: string | null;
  /** Null exactly when `mediaId` is null. */
  playback: PlaybackState | null;
  /** Who may send playback commands: everyone in the room, or only the host. */
  playbackAccess: PlaybackAccessMode;
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
