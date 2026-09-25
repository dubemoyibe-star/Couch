import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@couch/contracts";
import type { PrismaClient } from "@couch/database";
import { createInMemoryRoomStore } from "@couch/shared";
import { createRoomHandlers } from "./room-handlers";
import type { Connection } from "./server";

// A database whose every query fails, to reach the unexpected-failure path
// without a network. The cast is test-only: the handler only calls queries.
const failingDb = new Proxy(
  {},
  {
    get() {
      throw new Error("db down");
    },
  },
) as unknown as PrismaClient;

describe("room.join when the database fails", () => {
  it("answers internal_error with replyTo, reports it, and lets the connection retry", async () => {
    const errors: unknown[] = [];
    const sent: ServerMessage[] = [];
    const connection: Connection = { send: (message) => sent.push(message) };
    const rooms = createRoomHandlers({
      db: failingDb,
      store: createInMemoryRoomStore(),
      now: () => 0,
      onError: (error) => errors.push(error),
    });
    const join = { v: 1 as const, type: "room.join" as const, id: "j-1", payload: { couchId: "c1" } };

    rooms.onMessage({ userId: "u1" }, join, connection);
    await new Promise((resolve) => setTimeout(resolve, 20));
    rooms.onMessage({ userId: "u1" }, join, connection);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const expected = {
      v: 1,
      type: "error",
      payload: { code: "internal_error", message: "The server could not complete the request.", replyTo: "j-1" },
    };
    // The second attempt is judged again, not refused as already_joined.
    expect(sent).toEqual([expected, expected]);
    expect(errors).toHaveLength(2);
  });
});
