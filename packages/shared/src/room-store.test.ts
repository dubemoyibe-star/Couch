import { describe, expect, it } from "vitest";
import { createInMemoryRoomStore, createInitialPlaybackState, type RoomState } from "./index";

const room = (couchId: string, mediaId = "m1"): RoomState => ({
  couchId,
  mediaId,
  playback: createInitialPlaybackState(1_700_000_000_000),
  playbackAccess: "open",
});

describe("in-memory RoomStore", () => {
  it("returns undefined for an unknown couch", () => {
    expect(createInMemoryRoomStore().get("nope")).toBeUndefined();
  });
  it("returns what was set", () => {
    const store = createInMemoryRoomStore();
    store.set(room("a"));
    expect(store.get("a")).toEqual(room("a"));
  });
  it("set replaces an existing room", () => {
    const store = createInMemoryRoomStore();
    store.set(room("a", "m1"));
    store.set(room("a", "m2"));
    expect(store.get("a")?.mediaId).toBe("m2");
  });
  it("keeps couches separate", () => {
    const store = createInMemoryRoomStore();
    store.set(room("a", "m1"));
    store.set(room("b", "m2"));
    expect(store.get("a")?.mediaId).toBe("m1");
    expect(store.get("b")?.mediaId).toBe("m2");
  });
  it("stores are independent of each other", () => {
    const one = createInMemoryRoomStore();
    one.set(room("a"));
    expect(createInMemoryRoomStore().get("a")).toBeUndefined();
  });
});
