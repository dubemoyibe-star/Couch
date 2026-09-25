import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDatabaseEnv, createCouch, getPrismaClient, joinCouch, type PrismaClient } from "@couch/database";
import { createInMemoryRoomStore } from "@couch/shared";
import { getAuth } from "./auth";
import { createRoomHandlers } from "./room-handlers";
import { createRealtimeServer, type RealtimeServer } from "./server";
import { authenticateSession } from "./session";
import { nextClose, openSocket, record, settle } from "./ws-test-helpers";

assertDatabaseEnv(process.env, "test-suite");

// Real users, sessions, couches and members in the test database, a real ws
// server, and real client connections. Everything is removed afterward.
const secret = process.env.BETTER_AUTH_SECRET ?? "";
const baseUrl = process.env.BETTER_AUTH_URL ?? "";
const cookieName = `${baseUrl.startsWith("https:") ? "__Secure-" : ""}better-auth.session_token`;

function cookieFor(token: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${cookieName}=${encodeURIComponent(`${token}.${signature}`)}`;
}

const send = (type: string, payload: object, id?: string) =>
  JSON.stringify({ v: 1, type, ...(id ? { id } : {}), payload });

describe("room.leave and room.kick with real connections", () => {
  const prisma = getPrismaClient();
  const run = randomBytes(4).toString("hex");
  const day = 24 * 60 * 60 * 1000;
  const users: Record<"host" | "member" | "other" | "outsider", { id: string; token: string }> = {
    host: { id: "", token: randomUUID() },
    member: { id: "", token: randomUUID() },
    other: { id: "", token: randomUUID() },
    outsider: { id: "", token: randomUUID() },
  };
  let server: RealtimeServer;
  let port = 0;
  let origin = "";
  let dbBroken = false;
  const errors: unknown[] = [];
  const sockets: WebSocket[] = [];

  // The real client, except that once `dbBroken` is set every member query
  // throws, to reach the unexpected-failure path with a real connection.
  const db = new Proxy(prisma, {
    get(target, prop, receiver) {
      if (dbBroken && prop === "couchMember") throw new Error("db down");
      return Reflect.get(target, prop, receiver) as unknown;
    },
  }) as PrismaClient;

  async function connect(who: keyof typeof users) {
    const result = await openSocket(port, { origin, cookie: cookieFor(users[who].token) });
    if (!result.ok) throw new Error("expected an open socket");
    sockets.push(result.ws);
    return { ws: result.ws, ...record(result.ws) };
  }

  // A fresh couch: host plus member and other as participants.
  async function newCouch() {
    const couchId = (await createCouch(prisma, { ownerId: users.host.id, name: "TEST FIXTURE couch" })).couch.id;
    await joinCouch(prisma, { couchId, userId: users.member.id });
    await joinCouch(prisma, { couchId, userId: users.other.id });
    return couchId;
  }

  async function joined(who: keyof typeof users, couchId: string) {
    const client = await connect(who);
    client.ws.send(send("room.join", { couchId }));
    await client.waitFor(1);
    return client;
  }

  type Client = Awaited<ReturnType<typeof connect>>;

  // Messages of one type, after waiting for at least `count` of them. Joins by
  // other clients add memberJoined and presence messages, so tests match by type.
  async function ofType(client: Client, type: string, count = 1) {
    const deadline = Date.now() + 8000;
    while (client.messages.filter((m) => m.type === type).length < count) {
      if (Date.now() > deadline) throw new Error(`expected ${count} ${type} message(s)`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return client.messages.filter((m) => m.type === type);
  }

  const memberRows = (couchId: string) => prisma.couchMember.findMany({ where: { couchId } });

  beforeAll(async () => {
    for (const [label, entry] of Object.entries(users)) {
      const user = await prisma.user.create({
        data: { email: `rt-lk-${label}-${run}@example.test`, displayName: `TEST FIXTURE ${label}` },
      });
      entry.id = user.id;
      await prisma.session.create({
        data: { userId: user.id, token: entry.token, expiresAt: new Date(Date.now() + day) },
      });
    }
    const trusted = getAuth().options.trustedOrigins;
    if (!Array.isArray(trusted) || trusted[0] === undefined) throw new Error("no trusted origin");
    origin = trusted[0];
    const rooms = createRoomHandlers({
      db,
      store: createInMemoryRoomStore(),
      now: () => 1_700_000_000_000,
      onError: (error) => errors.push(error),
    });
    server = createRealtimeServer({
      authenticate: authenticateSession,
      allowedOrigins: trusted,
      onMessage: rooms.onMessage,
      onClose: rooms.onClose,
      closeTimeoutMs: 1000,
    });
    port = await server.listen(0, "127.0.0.1");
  });

  afterAll(async () => {
    for (const ws of sockets) ws.terminate();
    await server?.close();
    const ids = Object.values(users).map((user) => user.id);
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.couchMember.deleteMany({ where: { userId: { in: ids } } });
    await prisma.couch.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("host kicks a member: room.kicked, connection detached and closed, others see room.memberLeft once", async () => {
    const couchId = await newCouch();
    const host = await joined("host", couchId);
    const watcher = await joined("other", couchId);
    const member = await joined("member", couchId);
    await ofType(host, "room.memberJoined", 2);
    await ofType(watcher, "room.memberJoined", 1);
    const closed = nextClose(member.ws);

    host.ws.send(send("room.kick", { userId: users.member.id }, "k-1"));
    expect(await ofType(member, "room.kicked")).toEqual([{ v: 1, type: "room.kicked", payload: {} }]);
    expect(await closed).toBe(1008);
    const left = { v: 1, type: "room.memberLeft", payload: { userId: users.member.id } };
    expect(await ofType(host, "room.memberLeft")).toEqual([left]);
    expect(await ofType(watcher, "room.memberLeft")).toEqual([left]);
    expect(member.messages.map((m) => m.type)).toEqual(["room.state", "room.kicked"]);
    expect((await memberRows(couchId)).map((row) => row.userId).sort()).toEqual(
      [users.host.id, users.other.id].sort(),
    );
    expect(errors).toEqual([]);

    // The kicked user's close does not produce a second announcement.
    await settle();
    expect(host.messages.filter((m) => m.type === "room.memberLeft" || m.type === "presence.update")).toEqual([left]);
    host.ws.close();
    watcher.ws.close();
    await settle();
  });

  it("kicks every connection of the target in that room, and leaves the same user's other room alone", async () => {
    const couchId = await newCouch();
    const otherCouchId = await newCouch();
    const host = await joined("host", couchId);
    const tab1 = await joined("member", couchId);
    const tab2 = await joined("member", couchId);
    const elsewhere = await joined("member", otherCouchId);
    await ofType(host, "presence.update");
    const closed = [nextClose(tab1.ws), nextClose(tab2.ws)];

    host.ws.send(send("room.kick", { userId: users.member.id }));
    await Promise.all(closed);
    await ofType(host, "room.memberLeft");
    await settle();

    for (const tab of [tab1, tab2]) expect(tab.messages.filter((m) => m.type === "room.kicked")).toHaveLength(1);
    expect(host.messages.filter((m) => m.type === "room.memberLeft")).toHaveLength(1);
    // The other room is untouched: same socket open, no message, still a member.
    expect(elsewhere.ws.readyState).toBe(elsewhere.ws.OPEN);
    expect(elsewhere.messages.map((m) => m.type)).toEqual(["room.state"]);
    expect((await memberRows(otherCouchId)).some((row) => row.userId === users.member.id)).toBe(true);
    for (const c of [host, elsewhere]) c.ws.close();
    await settle();
  }, 60_000);

  it("refuses a non-host kick with forbidden and changes nothing", async () => {
    const couchId = await newCouch();
    const host = await joined("host", couchId);
    const member = await joined("member", couchId);
    const other = await joined("other", couchId);
    await ofType(host, "room.memberJoined", 2);
    await ofType(member, "room.memberJoined");

    member.ws.send(send("room.kick", { userId: users.other.id }, "k-2"));
    expect(await ofType(member, "error")).toEqual([
      {
        v: 1,
        type: "error",
        payload: { code: "forbidden", message: "Only the host can do that.", replyTo: "k-2" },
      },
    ]);
    await settle();
    expect(other.messages.map((m) => m.type)).toEqual(["room.state"]);
    expect(other.ws.readyState).toBe(other.ws.OPEN);
    expect(host.messages.map((m) => m.type)).toEqual(["room.state", "room.memberJoined", "room.memberJoined"]);
    expect(await memberRows(couchId)).toHaveLength(3);
    for (const c of [host, member, other]) c.ws.close();
    await settle();
  });

  it("answers cannot_remove_self, not_a_member for a non-member target, and not_joined before a join", async () => {
    const couchId = await newCouch();
    const host = await joined("host", couchId);

    host.ws.send(send("room.kick", { userId: users.host.id }));
    host.ws.send(send("room.kick", { userId: users.outsider.id }));
    await host.waitFor(3);
    const codes = host.messages.slice(1).map((m) => m.payload.code);
    expect(codes.sort()).toEqual(["cannot_remove_self", "not_a_member"]);
    expect(await memberRows(couchId)).toHaveLength(3);

    const lurker = await connect("host");
    lurker.ws.send(send("room.kick", { userId: users.member.id }));
    lurker.ws.send(send("room.leave", {}));
    await lurker.waitFor(2);
    expect(lurker.messages.map((m) => m.payload.code)).toEqual(["not_joined", "not_joined"]);
    host.ws.close();
    lurker.ws.close();
    await settle();
  });

  it("lets a member leave: they are told, others see room.memberLeft once, the socket stays open", async () => {
    const couchId = await newCouch();
    const host = await joined("host", couchId);
    const member = await joined("member", couchId);
    await host.waitFor(2);

    member.ws.send(send("room.leave", {}, "l-1"));
    await member.waitFor(2);
    await host.waitFor(3);
    await settle();

    const left = { v: 1, type: "room.memberLeft", payload: { userId: users.member.id } };
    expect(member.messages[1]).toEqual(left);
    expect(host.messages.slice(2)).toEqual([left]);
    expect((await memberRows(couchId)).map((row) => row.userId)).not.toContain(users.member.id);
    expect(member.ws.readyState).toBe(member.ws.OPEN);

    // Detached and no longer a member: the same socket is refused on rejoin.
    member.ws.send(send("room.join", { couchId }));
    await member.waitFor(3);
    expect(member.messages[2]?.payload.code).toBe("not_a_member");
    host.ws.close();
    member.ws.close();
    await settle();
  });

  it("refuses the host leaving with host_cannot_leave and leaves the connection attached", async () => {
    const couchId = await newCouch();
    const host = await joined("host", couchId);

    host.ws.send(send("room.leave", {}, "l-2"));
    await host.waitFor(2);
    expect(host.messages[1]).toEqual({
      v: 1,
      type: "error",
      payload: { code: "host_cannot_leave", message: "As the host, you cannot leave this couch.", replyTo: "l-2" },
    });
    expect(host.ws.readyState).toBe(host.ws.OPEN);
    expect(await memberRows(couchId)).toHaveLength(3);

    // Still attached: it hears a later join.
    const member = await joined("member", couchId);
    await host.waitFor(3);
    expect(host.messages[2]?.type).toBe("room.memberJoined");
    host.ws.close();
    member.ws.close();
    await settle();
  });

  it("broadcasts room.memberLeft once when a user with two open connections leaves", async () => {
    const couchId = await newCouch();
    const host = await joined("host", couchId);
    const tab1 = await joined("member", couchId);
    const tab2 = await joined("member", couchId);
    await ofType(host, "presence.update");

    tab1.ws.send(send("room.leave", {}));
    const left = { v: 1, type: "room.memberLeft", payload: { userId: users.member.id } };
    // Both of the leaver's tabs are told, and neither socket closed.
    expect(await ofType(tab1, "room.memberLeft")).toEqual([left]);
    expect(await ofType(tab2, "room.memberLeft")).toEqual([left]);
    expect(await ofType(host, "room.memberLeft")).toEqual([left]);
    await settle(500);
    expect(host.messages.filter((m) => m.type === "room.memberLeft")).toEqual([left]);
    expect(tab1.ws.readyState).toBe(tab1.ws.OPEN);
    expect(tab2.ws.readyState).toBe(tab2.ws.OPEN);

    // Closing the tabs afterward produces no presence.update for a non-member.
    tab1.ws.close();
    tab2.ws.close();
    await settle();
    expect(host.messages.map((m) => m.type)).toEqual(["room.state", "room.memberJoined", "presence.update", "room.memberLeft"]);
    host.ws.close();
    await settle();
  });

  it("answers internal_error to leave and kick when the database fails, and keeps the connections attached", async () => {
    const couchId = await newCouch();
    const host = await joined("host", couchId);
    const member = await joined("member", couchId);
    await host.waitFor(2);
    errors.length = 0;

    dbBroken = true;
    try {
      member.ws.send(send("room.leave", {}, "l-3"));
      host.ws.send(send("room.kick", { userId: users.member.id }, "k-3"));
      await member.waitFor(2);
      await host.waitFor(3);
    } finally {
      dbBroken = false;
    }
    const failure = (replyTo: string) => ({
      v: 1,
      type: "error",
      payload: { code: "internal_error", message: "The server could not complete the request.", replyTo },
    });
    expect(member.messages[1]).toEqual(failure("l-3"));
    expect(host.messages[2]).toEqual(failure("k-3"));
    expect(errors).toHaveLength(2);
    expect(member.ws.readyState).toBe(member.ws.OPEN);
    expect(await memberRows(couchId)).toHaveLength(3);

    // Nothing was detached: a retry works.
    host.ws.send(send("room.kick", { userId: users.member.id }));
    await host.waitFor(4);
    expect(host.messages[3]?.type).toBe("room.memberLeft");
    host.ws.close();
    await settle();
  });
});
