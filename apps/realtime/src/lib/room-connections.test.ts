import { describe, expect, it } from "vitest";
import { createRoomConnections } from "./room-connections";

const conn = () => ({});

describe("room connections", () => {
  it("reports the first connection of a user, and not the second", () => {
    const rooms = createRoomConnections<object>();
    const a = conn();
    const b = conn();
    rooms.begin(a);
    rooms.begin(b);
    expect(rooms.attach(a, "c1", "u1")).toEqual({ firstForUser: true });
    expect(rooms.attach(b, "c1", "u1")).toEqual({ firstForUser: false });
    expect(rooms.isOnline("c1", "u1")).toBe(true);
  });

  it("stays online until the last connection of the user closes", () => {
    const rooms = createRoomConnections<object>();
    const a = conn();
    const b = conn();
    for (const c of [a, b]) {
      rooms.begin(c);
      rooms.attach(c, "c1", "u1");
    }
    expect(rooms.close(a)).toEqual({ couchId: "c1", userId: "u1", wasLast: false });
    expect(rooms.isOnline("c1", "u1")).toBe(true);
    expect(rooms.close(b)).toEqual({ couchId: "c1", userId: "u1", wasLast: true });
    expect(rooms.isOnline("c1", "u1")).toBe(false);
  });

  it("refuses a second claim on a connection, attached or still joining", () => {
    const rooms = createRoomConnections<object>();
    const a = conn();
    expect(rooms.begin(a)).toBe(true);
    expect(rooms.begin(a)).toBe(false);
    rooms.attach(a, "c1", "u1");
    expect(rooms.begin(a)).toBe(false);
  });

  it("lets a connection retry after an aborted join", () => {
    const rooms = createRoomConnections<object>();
    const a = conn();
    rooms.begin(a);
    rooms.abort(a);
    expect(rooms.begin(a)).toBe(true);
  });

  it("refuses to claim a closed connection and reports it closed", () => {
    const rooms = createRoomConnections<object>();
    const a = conn();
    rooms.begin(a);
    expect(rooms.close(a)).toBeNull();
    expect(rooms.isOpen(a)).toBe(false);
    expect(rooms.begin(a)).toBe(false);
  });

  it("lists the other connections in the same room only", () => {
    const rooms = createRoomConnections<object>();
    const a = conn();
    const b = conn();
    const other = conn();
    rooms.begin(a);
    rooms.attach(a, "c1", "u1");
    rooms.begin(b);
    rooms.attach(b, "c1", "u2");
    rooms.begin(other);
    rooms.attach(other, "c2", "u3");
    expect(rooms.peers("c1", a)).toEqual([b]);
    expect(rooms.peers("c1")).toHaveLength(2);
  });
});
