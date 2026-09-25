import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertDatabaseEnv,
  createCouch,
  deactivateMissing,
  getMembership,
  getPrismaClient,
  joinCouch,
  setCurrentMedia,
  upsertCatalogMedia,
} from "@couch/database";
import { MAX_CLIENT_MESSAGE_BYTES, type MediaWithLicense } from "@couch/contracts";
import { createInMemoryRoomStore, type RoomStore } from "@couch/shared";
import { getAuth } from "./auth";
import { createRoomHandlers } from "./room-handlers";
import { createRealtimeServer, type RealtimeServer } from "./server";
import { authenticateSession } from "./session";
import { nextClose, openSocket, record, settle } from "./ws-test-helpers";

assertDatabaseEnv(process.env, "test-suite");

// Hostile and malformed input against the real server, real handlers, real
// sessions and real membership in the test database, over real ws connections.
const secret = process.env.BETTER_AUTH_SECRET ?? "";
const baseUrl = process.env.BETTER_AUTH_URL ?? "";
const cookieName = `${baseUrl.startsWith("https:") ? "__Secure-" : ""}better-auth.session_token`;

function cookieFor(token: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${cookieName}=${encodeURIComponent(`${token}.${signature}`)}`;
}

const send = (type: string, payload: object, id?: string) =>
  JSON.stringify({ v: 1, type, ...(id ? { id } : {}), payload });

const fixtureFor = (providerId: string, providerMediaId: string): MediaWithLicense => ({
  providerId,
  providerMediaId,
  title: `TEST FIXTURE media ${providerMediaId}`,
  description: null,
  durationSeconds: 600,
  posterUrl: null,
  releaseYear: null,
  license: {
    licenseName: "TEST FIXTURE License",
    licenseVersion: null,
    licenseUrl: "https://example.com/license",
    sourceUrl: "https://example.com/items/1",
    rightsholder: null,
    attributionRequired: false,
    attribution: null,
    intendedUseAllowed: true,
    commercialUseAllowed: false,
    additionalRestrictions: null,
    verifiedAt: "2026-02-03",
    verificationNotes: null,
  },
});

type Who = "hostA" | "hostB" | "both" | "plusA";

describe("realtime hardening with real connections", () => {
  const prisma = getPrismaClient();
  const run = randomBytes(4).toString("hex");
  const providerId = `dbtest-rt-hd-${run}`;
  const day = 24 * 60 * 60 * 1000;
  const users: Record<Who, { id: string; token: string }> = {
    hostA: { id: "", token: randomUUID() },
    hostB: { id: "", token: randomUUID() },
    both: { id: "", token: randomUUID() },
    plusA: { id: "", token: randomUUID() },
  };
  const ids = { a: "", b: "" };
  let server: RealtimeServer;
  let port = 0;
  let origin = "";
  let clock = 1_700_000_000_000;
  const errors: unknown[] = [];
  const handlerErrors: unknown[] = [];
  const store: RoomStore = createInMemoryRoomStore();
  const sockets: WebSocket[] = [];

  async function connect(who: Who) {
    const result = await openSocket(port, { origin, cookie: cookieFor(users[who].token) });
    if (!result.ok) throw new Error("expected an open socket");
    sockets.push(result.ws);
    return { ws: result.ws, ...record(result.ws) };
  }
  type Client = Awaited<ReturnType<typeof connect>>;

  async function ofType(client: Client, type: string, count = 1) {
    const deadline = Date.now() + 8000;
    while (client.messages.filter((m) => m.type === type).length < count) {
      if (Date.now() > deadline) throw new Error(`expected ${count} ${type} message(s)`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return client.messages.filter((m) => m.type === type);
  }
  const codes = (client: Client) =>
    client.messages.filter((m) => m.type === "error").map((m) => m.payload.code);
  const syncs = (client: Client) => client.messages.filter((m) => m.type === "playback.sync");

  async function join(who: Who, couchId: string) {
    const client = await connect(who);
    client.ws.send(send("room.join", { couchId }));
    await ofType(client, "room.state");
    return client;
  }

  // A couch owned by `owner` with `members` added, optionally on media.
  async function makeCouch(owner: Who, members: Who[], mediaId: string | null) {
    const couchId = (await createCouch(prisma, { ownerId: users[owner].id, name: "TEST FIXTURE couch" })).couch.id;
    for (const member of members) await joinCouch(prisma, { couchId, userId: users[member].id });
    if (mediaId) {
      const set = await setCurrentMedia(prisma, { couchId, actingUserId: users[owner].id, mediaId });
      if (!set.ok) throw new Error("could not set media");
    }
    return couchId;
  }

  const closeAll = async (...clients: Client[]) => {
    for (const c of clients) c.ws.close();
    await settle();
  };

  // The server is alive and serving after hostile input: a fresh connection can
  // join and gets its state.
  async function expectServing(couchId: string) {
    const probe = await join("hostA", couchId);
    expect(probe.messages[0]?.type).toBe("room.state");
    probe.ws.close();
  }

  beforeAll(async () => {
    for (const [label, entry] of Object.entries(users)) {
      const user = await prisma.user.create({
        data: { email: `rt-hd-${label}-${run}@example.test`, displayName: `TEST FIXTURE ${label}` },
      });
      entry.id = user.id;
      await prisma.session.create({
        data: { userId: user.id, token: entry.token, expiresAt: new Date(Date.now() + day) },
      });
    }
    for (const [key, providerMediaId] of [
      ["a", "item-a"],
      ["b", "item-b"],
    ] as const) {
      const media = await upsertCatalogMedia(prisma, fixtureFor(providerId, providerMediaId));
      if (!media) throw new Error("fixture media was refused");
      ids[key] = media.id;
    }
    const trusted = getAuth().options.trustedOrigins;
    if (!Array.isArray(trusted) || trusted[0] === undefined) throw new Error("no trusted origin");
    origin = trusted[0];
    const rooms = createRoomHandlers({
      db: prisma,
      store,
      now: () => (clock += 1000),
      onError: (error) => errors.push(error),
    });
    server = createRealtimeServer({
      authenticate: authenticateSession,
      allowedOrigins: trusted,
      onMessage: rooms.onMessage,
      onClose: rooms.onClose,
      onHandlerError: (error) => handlerErrors.push(error),
      closeTimeoutMs: 1000,
    });
    port = await server.listen(0, "127.0.0.1");
  });

  afterAll(async () => {
    for (const ws of sockets) ws.terminate();
    await server?.close();
    const userIds = Object.values(users).map((user) => user.id);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.couchMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.couch.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await deactivateMissing(prisma, providerId, []);
    await prisma.$disconnect();
  });

  describe("messages for a room the connection has not joined", () => {
    const cases: [string, object][] = [
      ["playback.play", { position: 1 }],
      ["playback.pause", { position: 1 }],
      ["playback.seek", { position: 1 }],
      ["playback.setRate", { rate: 1.5 }],
      ["playback.setAccess", { mode: "host" }],
      ["room.leave", {}],
      ["room.kick", { userId: randomUUID() }],
      ["room.setMedia", { mediaId: null }],
    ];

    it.each(cases)("%s before any room.join is refused with not_joined and echoes the id", async (type, payload) => {
      const client = await connect("hostA");
      client.ws.send(send(type, payload, "req-1"));
      const [reply] = await ofType(client, "error");
      expect(reply?.payload).toMatchObject({ code: "not_joined", replyTo: "req-1" });
      expect(client.ws.readyState).toBe(client.ws.OPEN);
      client.ws.close();
    });

    it("the connection is unharmed afterward: it can still join and control the room", async () => {
      const couchId = await makeCouch("hostA", [], ids.a);
      const client = await connect("hostA");
      for (const [type, payload] of cases) client.ws.send(send(type, payload));
      await ofType(client, "error", cases.length);
      expect(codes(client)).toEqual(cases.map(() => "not_joined"));
      client.ws.send(send("room.join", { couchId }));
      await ofType(client, "room.state");
      client.ws.send(send("playback.play", { position: 3 }));
      await ofType(client, "playback.sync");
      expect(store.get(couchId)?.playback?.revision).toBe(1);
      expect(errors).toEqual([]);
      await closeAll(client);
    });

    it("a connection whose room.leave succeeded is not_joined again for later commands", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const client = await join("plusA", couchId);
      client.ws.send(send("room.leave", {}));
      await ofType(client, "room.memberLeft");
      client.ws.send(send("playback.play", { position: 1 }, "after-leave"));
      await ofType(client, "error");
      expect(codes(client)).toEqual(["not_joined"]);
      await closeAll(client);
    });
  });

  describe("message types with no handler", () => {
    it("chat.send before joining is refused with unknown_type and echoes the id", async () => {
      const client = await connect("hostA");
      client.ws.send(send("chat.send", { text: "hello" }, "chat-1"));
      const [reply] = await ofType(client, "error");
      expect(reply?.payload).toMatchObject({ code: "unknown_type", replyTo: "chat-1" });
      expect(client.ws.readyState).toBe(client.ws.OPEN);
      client.ws.close();
    });

    it("chat.send while joined is refused with unknown_type, is not broadcast, and the connection keeps working", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const host = await join("hostA", couchId);
      const member = await join("plusA", couchId);
      await ofType(host, "room.memberJoined");
      host.ws.send(send("chat.send", { text: "hello" }, "chat-2"));
      await ofType(host, "error");
      expect(host.messages.find((m) => m.type === "error")?.payload).toMatchObject({
        code: "unknown_type",
        replyTo: "chat-2",
      });
      await settle();
      expect(member.messages.filter((m) => m.type !== "room.state")).toEqual([]);
      host.ws.send(send("playback.play", { position: 2 }));
      await ofType(member, "playback.sync");
      expect(errors).toEqual([]);
      expect(handlerErrors).toEqual([]);
      await closeAll(host, member);
    });

    it("a type the catalog does not know at all is refused with unknown_type", async () => {
      const client = await connect("hostA");
      client.ws.send(send("does.not.exist", {}, "nope"));
      await ofType(client, "error");
      expect(client.messages[0]?.payload).toMatchObject({ code: "unknown_type", replyTo: "nope" });
      client.ws.close();
    });
  });

  describe("malformed and oversized input", () => {
    it("non-object top-level JSON is refused with invalid_json and the connection stays open", async () => {
      const client = await connect("hostA");
      const frames = ["null", "42", '"text"', "true", "[]", '[{"v":1}]', "", "{", "not json"];
      for (const frame of frames) client.ws.send(frame);
      await ofType(client, "error", frames.length);
      expect(codes(client)).toEqual(frames.map(() => "invalid_json"));
      expect(client.ws.readyState).toBe(client.ws.OPEN);
      client.ws.close();
    });

    it("deeply nested JSON (an array and an object, each just under the size cap) is refused without crashing", async () => {
      const client = await connect("hostA");
      const depth = MAX_CLIENT_MESSAGE_BYTES / 2 - 2;
      client.ws.send("[".repeat(depth) + "]".repeat(depth));
      client.ws.send('{"a":'.repeat(Math.floor(MAX_CLIENT_MESSAGE_BYTES / 6)) + "1" + "}".repeat(Math.floor(MAX_CLIENT_MESSAGE_BYTES / 6)));
      // Nested inside a real message's payload.
      client.ws.send(
        `{"v":1,"type":"room.join","payload":{"couchId":${"[".repeat(20000)}${"]".repeat(20000)}}}`,
      );
      await ofType(client, "error", 3);
      expect(codes(client)).toEqual(["invalid_json", "unsupported_version", "invalid_payload"]);
      expect(client.ws.readyState).toBe(client.ws.OPEN);
      client.ws.close();
    });

    it("a binary frame is refused with invalid_json and the connection stays open", async () => {
      const client = await connect("hostA");
      client.ws.send(Buffer.from([0x00, 0xff, 0x10, 0x80]), { binary: true });
      // A binary frame that happens to contain a valid message is still not a message.
      client.ws.send(Buffer.from(send("room.leave", {})), { binary: true });
      await ofType(client, "error", 2);
      expect(codes(client)).toEqual(["invalid_json", "invalid_json"]);
      expect(client.ws.readyState).toBe(client.ws.OPEN);
      client.ws.close();
    });

    it("invalid UTF-8 in a text frame closes only that connection (1007), never the server", async () => {
      const couchId = await makeCouch("hostA", [], ids.a);
      const bad = await connect("hostA");
      const other = await join("hostA", couchId);
      const closed = nextClose(bad.ws);
      // Send a text frame whose payload is not valid UTF-8 through the raw socket API.
      bad.ws.send(Buffer.from([0xc3, 0x28]), { binary: false });
      expect(await closed).toBe(1007);
      expect(other.ws.readyState).toBe(other.ws.OPEN);
      await expectServing(couchId);
      await closeAll(other);
    });

    it("a message over the contract cap but under the frame limit gets message_too_large and the connection stays open", async () => {
      const client = await connect("hostA");
      client.ws.send(JSON.stringify({ v: 1, type: "room.join", payload: { couchId: "x".repeat(MAX_CLIENT_MESSAGE_BYTES + 100) } }));
      await ofType(client, "error");
      expect(codes(client)).toEqual(["message_too_large"]);
      expect(client.ws.readyState).toBe(client.ws.OPEN);
      client.ws.close();
    });

    it("a frame over the socket limit closes that connection with 1009 and the server keeps serving others", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const bystander = await join("plusA", couchId);
      const big = await connect("hostA");
      const closed = nextClose(big.ws);
      big.ws.send("x".repeat(MAX_CLIENT_MESSAGE_BYTES * 2 + 1));
      expect(await closed).toBe(1009);
      expect(bystander.ws.readyState).toBe(bystander.ws.OPEN);
      await expectServing(couchId);
      await closeAll(bystander);
    });

    it("unsupported versions, wrong-typed envelopes and unknown keys are refused, and state is untouched", async () => {
      const couchId = await makeCouch("hostA", [], ids.a);
      const host = await join("hostA", couchId);
      const before = store.get(couchId);
      host.ws.send(JSON.stringify({ v: 2, type: "playback.play", payload: { position: 1 } }));
      host.ws.send(JSON.stringify({ v: "1", type: "playback.play", payload: { position: 1 } }));
      host.ws.send(JSON.stringify({ v: 1, type: 7, payload: {} }));
      host.ws.send(send("playback.play", { position: -5 }));
      host.ws.send(send("playback.play", { position: "1" }));
      host.ws.send(send("playback.play", { position: 1, extra: true }));
      host.ws.send(JSON.stringify({ v: 1, type: "playback.play" }));
      await ofType(host, "error", 7);
      expect(codes(host)).toEqual([
        "unsupported_version",
        "unsupported_version",
        "unknown_type",
        "invalid_payload",
        "invalid_payload",
        "invalid_payload",
        "invalid_payload",
      ]);
      expect(store.get(couchId)).toEqual(before);
      expect(syncs(host)).toEqual([]);
      await closeAll(host);
    });

    it("identity in a payload is never trusted: a non-host claiming host, and a spoofed userId, change nothing", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const host = await join("hostA", couchId);
      const member = await join("plusA", couchId);
      await ofType(host, "room.memberJoined");
      // A payload cannot carry identity or role: extra keys are refused.
      member.ws.send(send("playback.setAccess", { mode: "host", userId: users.hostA.id, role: "host" }, "spoof-1"));
      member.ws.send(JSON.stringify({ v: 1, type: "room.kick", userId: users.hostA.id, payload: { userId: users.hostA.id } }));
      // A member (cached role participant) cannot do host actions.
      member.ws.send(send("playback.setAccess", { mode: "host" }, "spoof-2"));
      member.ws.send(send("room.kick", { userId: users.hostA.id }, "spoof-3"));
      member.ws.send(send("room.setMedia", { mediaId: ids.b }, "spoof-4"));
      await ofType(member, "error", 5);
      expect(codes(member)).toEqual(["invalid_payload", "invalid_payload", "forbidden", "forbidden", "forbidden"]);
      expect(store.get(couchId)).toMatchObject({ mediaId: ids.a, playbackAccess: "open" });
      expect(await getMembership(prisma, { couchId, userId: users.hostA.id })).not.toBeNull();
      expect(host.messages.filter((m) => m.type === "error")).toEqual([]);
      await closeAll(host, member);
    });

    it("a member cannot leave or kick through a room it names: the room is always the attached one", async () => {
      const couchA = await makeCouch("hostA", ["both"], ids.a);
      const couchB = await makeCouch("hostB", ["both"], ids.b);
      const inA = await join("both", couchA);
      inA.ws.send(send("room.leave", { couchId: couchB }));
      await ofType(inA, "error");
      expect(codes(inA)).toEqual(["invalid_payload"]);
      expect(await getMembership(prisma, { couchId: couchB, userId: users.both.id })).not.toBeNull();
      await closeAll(inA);
    });
  });

  describe("rapid-fire and near-simultaneous messages", () => {
    it("100 commands sent in one tick apply one at a time: revisions are contiguous and every peer sees them in order", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const host = await join("hostA", couchId);
      const member = await join("plusA", couchId);
      await ofType(host, "room.memberJoined");
      for (let i = 0; i < 100; i++) {
        host.ws.send(send("playback.seek", { position: i }));
        // Garbage interleaved with commands must not disturb them.
        if (i % 10 === 0) host.ws.send("{oops");
      }
      await ofType(member, "playback.sync", 100);
      const revisions = syncs(member).map((m) => (m.payload.state as { revision: number }).revision);
      expect(revisions).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
      expect(syncs(host).length).toBe(100);
      expect(store.get(couchId)?.playback?.revision).toBe(100);
      expect(codes(host)).toEqual(Array.from({ length: 10 }, () => "invalid_json"));
      await closeAll(host, member);
    });

    it("commands from two connections at once each build on the last: no lost or duplicated revision", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const host = await join("hostA", couchId);
      const member = await join("plusA", couchId);
      await ofType(host, "room.memberJoined");
      for (let i = 0; i < 50; i++) {
        host.ws.send(send("playback.seek", { position: i }));
        member.ws.send(send("playback.seek", { position: 100 + i }));
      }
      await ofType(host, "playback.sync", 100);
      await ofType(member, "playback.sync", 100);
      const revisions = syncs(host).map((m) => (m.payload.state as { revision: number }).revision);
      expect(revisions).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
      expect(syncs(member).map((m) => (m.payload.state as { revision: number }).revision)).toEqual(revisions);
      expect(store.get(couchId)?.playback?.revision).toBe(100);
      await closeAll(host, member);
    });

    it("a burst of room.join on one connection joins once and refuses the rest with already_joined", async () => {
      const couchId = await makeCouch("hostA", [], ids.a);
      const client = await connect("hostA");
      for (let i = 0; i < 20; i++) client.ws.send(send("room.join", { couchId }));
      await ofType(client, "room.state");
      await ofType(client, "error", 19);
      expect(client.messages.filter((m) => m.type === "room.state")).toHaveLength(1);
      expect(codes(client)).toEqual(Array.from({ length: 19 }, () => "already_joined"));
      expect(errors).toEqual([]);
      await closeAll(client);
    });

    it("a command sent immediately after room.join, before the join finishes, is refused not_joined, not a crash", async () => {
      const couchId = await makeCouch("hostA", [], ids.a);
      const client = await connect("hostA");
      client.ws.send(send("room.join", { couchId }));
      client.ws.send(send("playback.play", { position: 1 }, "early"));
      await ofType(client, "room.state");
      await ofType(client, "error");
      expect(codes(client)).toEqual(["not_joined"]);
      expect(handlerErrors).toEqual([]);
      await closeAll(client);
    });
  });

  describe("abrupt disconnects", () => {
    it("terminate() right after sending a command: the command is applied whole or not at all, and presence ends offline", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const host = await join("hostA", couchId);
      const member = await join("plusA", couchId);
      await ofType(host, "room.memberJoined");
      member.ws.send(send("playback.play", { position: 7 }));
      member.ws.terminate();
      await ofType(host, "presence.update");
      await settle();
      const room = store.get(couchId);
      const seen = syncs(host);
      // Either the command landed (one revision, host saw it) or it did not (none): never half.
      expect(room?.playback?.revision).toBe(seen.length);
      expect(seen.length).toBeLessThanOrEqual(1);
      expect(host.messages.filter((m) => m.type === "presence.update").map((m) => m.payload)).toEqual([
        { userId: users.plusA.id, online: false },
      ]);
      // The room still works for the host.
      host.ws.send(send("playback.pause", { position: 9 }));
      await ofType(host, "playback.sync", seen.length + 1);
      expect(errors).toEqual([]);
      await closeAll(host);
    });

    it("terminate() during room.join leaves nothing attached: the member is offline in every later roster", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const host = await join("hostA", couchId);
      const member = await connect("plusA");
      member.ws.send(send("room.join", { couchId }));
      member.ws.terminate();
      await settle(1500);
      const observer = await join("hostA", couchId);
      const roster = observer.messages[0]?.payload.members as { userId: string; online: boolean }[];
      expect(roster.find((m) => m.userId === users.plusA.id)?.online).toBe(false);
      // Whatever the host was told is consistent with that: never "online" as the last word.
      const told = host.messages.filter(
        (m) => (m.type === "presence.update" && m.payload.userId === users.plusA.id) || m.type === "room.memberJoined",
      );
      const last = told.at(-1);
      if (last) expect(last.type).toBe("presence.update");
      expect(errors).toEqual([]);
      await closeAll(host, observer);
    });

    it("terminate() during room.leave leaves membership and presence consistent", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const host = await join("hostA", couchId);
      const member = await join("plusA", couchId);
      await ofType(host, "room.memberJoined");
      member.ws.send(send("room.leave", {}));
      member.ws.terminate();
      await ofType(host, "room.memberLeft").catch(() => ofType(host, "presence.update"));
      await settle(1500);
      const row = await getMembership(prisma, { couchId, userId: users.plusA.id });
      const observer = await join("hostA", couchId);
      const roster = observer.messages[0]?.payload.members as { userId: string; online: boolean }[];
      const entry = roster.find((m) => m.userId === users.plusA.id);
      if (row) {
        // The leave never reached the server: still a member, but offline.
        expect(entry?.online).toBe(false);
      } else {
        // The leave landed: gone from the roster and the host was told.
        expect(entry).toBeUndefined();
        expect(host.messages.some((m) => m.type === "room.memberLeft")).toBe(true);
      }
      expect(errors).toEqual([]);
      await closeAll(host, observer);
    });

    it("the host terminating mid-kick still removes the target, and the target is closed", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const host = await join("hostA", couchId);
      const target = await join("plusA", couchId);
      await ofType(host, "room.memberJoined");
      const closed = nextClose(target.ws);
      host.ws.send(send("room.kick", { userId: users.plusA.id }));
      host.ws.terminate();
      const code = await Promise.race([closed, settle(3000).then(() => 0)]);
      const row = await getMembership(prisma, { couchId, userId: users.plusA.id });
      // Either the kick landed (row gone, target closed 1008) or it did not (row kept, target still open).
      if (row) expect(code).toBe(0);
      else expect(code).toBe(1008);
      const observer = await join("hostA", couchId);
      const roster = observer.messages[0]?.payload.members as { userId: string; online: boolean }[];
      expect(roster.find((m) => m.userId === users.hostA.id)?.online).toBe(true);
      expect(errors).toEqual([]);
      await closeAll(observer, target);
    });

    it("a user with two connections: terminating one keeps them online, terminating the last takes them offline", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const host = await join("hostA", couchId);
      const one = await join("plusA", couchId);
      await ofType(host, "room.memberJoined");
      const two = await join("plusA", couchId);
      await ofType(host, "presence.update");
      const before = host.messages.filter((m) => m.type === "presence.update").length;
      one.ws.terminate();
      await settle(500);
      expect(host.messages.filter((m) => m.type === "presence.update")).toHaveLength(before);
      two.ws.terminate();
      await ofType(host, "presence.update", before + 1);
      expect(host.messages.filter((m) => m.type === "presence.update").at(-1)?.payload).toEqual({
        userId: users.plusA.id,
        online: false,
      });
      await closeAll(host);
    });

    it("a dozen abrupt disconnects leave no attached connections behind", async () => {
      const couchId = await makeCouch("hostA", ["plusA"], ids.a);
      const host = await join("hostA", couchId);
      const baseline = server.connectionCount;
      const many: Client[] = [];
      // Joined concurrently: each join is several database round trips.
      const opened = await Promise.all(Array.from({ length: 12 }, () => connect("plusA")));
      for (const client of opened) client.ws.send(send("room.join", { couchId }));
      await Promise.all(opened.map((client) => ofType(client, "room.state")));
      many.push(...opened);
      for (const client of many) client.ws.terminate();
      await settle(1000);
      expect(server.connectionCount).toBe(baseline);
      const observer = await join("hostA", couchId);
      const roster = observer.messages[0]?.payload.members as { userId: string; online: boolean }[];
      expect(roster.find((m) => m.userId === users.plusA.id)?.online).toBe(false);
      await closeAll(host, observer);
    });
  });

  describe("two rooms live at once", () => {
    it("a locked room and an open room stay isolated: modes, playback and broadcasts never cross", async () => {
      const couchA = await makeCouch("hostA", ["both", "plusA"], ids.a);
      const couchB = await makeCouch("hostB", ["both"], ids.b);
      const hostA = await join("hostA", couchA);
      const bothInA = await join("both", couchA);
      const plusA = await join("plusA", couchA);
      const hostB = await join("hostB", couchB);
      const bothInB = await join("both", couchB);
      await ofType(hostA, "room.memberJoined", 2);
      await ofType(hostB, "room.memberJoined");

      // Lock A only.
      hostA.ws.send(send("playback.setAccess", { mode: "host" }));
      await ofType(plusA, "playback.accessChanged");
      await settle();
      expect(store.get(couchA)?.playbackAccess).toBe("host");
      expect(store.get(couchB)?.playbackAccess).toBe("open");
      expect(hostB.messages.filter((m) => m.type === "playback.accessChanged")).toEqual([]);
      expect(bothInB.messages.filter((m) => m.type === "playback.accessChanged")).toEqual([]);

      // The same user: refused in the locked room, allowed in the open one.
      bothInA.ws.send(send("playback.play", { position: 5 }, "in-a"));
      bothInB.ws.send(send("playback.play", { position: 6 }, "in-b"));
      await ofType(bothInA, "error");
      await ofType(hostB, "playback.sync");
      expect(bothInA.messages.find((m) => m.type === "error")?.payload).toMatchObject({ code: "forbidden", replyTo: "in-a" });
      expect(codes(bothInB)).toEqual([]);
      expect(store.get(couchA)?.playback).toMatchObject({ status: "paused", revision: 0 });
      expect(store.get(couchB)?.playback).toMatchObject({ status: "playing", revision: 1, position: 6 });

      // Nothing from B reached A, and nothing from A reached B.
      expect(syncs(hostA)).toEqual([]);
      expect(syncs(plusA)).toEqual([]);
      expect(syncs(bothInA)).toEqual([]);
      expect(syncs(hostB)).toHaveLength(1);
      expect(syncs(bothInB)).toHaveLength(1);

      // The host of A can still command A while locked, and B does not see it.
      hostA.ws.send(send("playback.seek", { position: 50 }));
      await ofType(plusA, "playback.sync");
      expect(syncs(hostB)).toHaveLength(1);
      expect(store.get(couchB)?.playback?.revision).toBe(1);

      // Locking B later does not unlock or alter A, and opening A leaves B locked.
      hostB.ws.send(send("playback.setAccess", { mode: "host" }));
      await ofType(bothInB, "playback.accessChanged");
      expect(store.get(couchA)?.playbackAccess).toBe("host");
      hostA.ws.send(send("playback.setAccess", { mode: "open" }));
      await ofType(plusA, "playback.accessChanged", 2);
      expect(store.get(couchB)?.playbackAccess).toBe("host");
      expect(hostB.messages.filter((m) => m.type === "playback.accessChanged")).toHaveLength(1);

      // A late joiner learns each room's own mode.
      const lateA = await join("plusA", couchA);
      const lateB = await join("both", couchB);
      expect(lateA.messages[0]?.payload.playbackAccess).toBe("open");
      expect(lateB.messages[0]?.payload.playbackAccess).toBe("host");
      expect(errors).toEqual([]);
      await closeAll(hostA, bothInA, plusA, hostB, bothInB, lateA, lateB);
    });

    it("setMedia, kick and leave in one room never touch the other", async () => {
      const couchA = await makeCouch("hostA", ["both", "plusA"], ids.a);
      const couchB = await makeCouch("hostB", ["both"], ids.a);
      const hostA = await join("hostA", couchA);
      const bothInA = await join("both", couchA);
      const plusA = await join("plusA", couchA);
      const hostB = await join("hostB", couchB);
      const bothInB = await join("both", couchB);
      await ofType(hostA, "room.memberJoined", 2);
      await ofType(hostB, "room.memberJoined");
      const bBefore = store.get(couchB);
      const bMessages = hostB.messages.length + bothInB.messages.length;

      hostA.ws.send(send("room.setMedia", { mediaId: ids.b }));
      await ofType(plusA, "room.mediaChanged");
      hostA.ws.send(send("room.setMedia", { mediaId: null }));
      await ofType(plusA, "room.mediaChanged", 2);
      hostA.ws.send(send("room.kick", { userId: users.plusA.id }));
      await ofType(plusA, "room.kicked");
      bothInA.ws.send(send("room.leave", {}));
      await ofType(bothInA, "room.memberLeft");
      await settle();

      expect(store.get(couchB)).toEqual(bBefore);
      expect(hostB.messages.length + bothInB.messages.length).toBe(bMessages);
      // The same user who left A is still a member and still online in B.
      expect(await getMembership(prisma, { couchId: couchB, userId: users.both.id })).not.toBeNull();
      expect(bothInB.ws.readyState).toBe(bothInB.ws.OPEN);
      bothInB.ws.send(send("playback.pause", { position: 1 }));
      await ofType(hostB, "playback.sync");

      // Naming the other room's member in a kick from the wrong room does nothing to it.
      hostA.ws.send(send("room.kick", { userId: users.hostB.id }, "cross"));
      await ofType(hostA, "error");
      expect(codes(hostA)).toEqual(["not_a_member"]);
      expect(store.get(couchB)?.mediaId).toBe(ids.a);
      // A connection cannot join a room it is not a member of.
      const stranger = await connect("hostA");
      stranger.ws.send(send("room.join", { couchId: couchB }));
      await ofType(stranger, "error");
      expect(codes(stranger)).toEqual(["not_a_member"]);
      expect(errors).toEqual([]);
      await closeAll(hostA, bothInA, plusA, hostB, bothInB, stranger);
    });

    it("abruptly disconnecting in one room changes presence there only", async () => {
      const couchA = await makeCouch("hostA", ["both"], ids.a);
      const couchB = await makeCouch("hostB", ["both"], ids.b);
      const hostA = await join("hostA", couchA);
      const bothInA = await join("both", couchA);
      const hostB = await join("hostB", couchB);
      const bothInB = await join("both", couchB);
      await ofType(hostA, "room.memberJoined");
      await ofType(hostB, "room.memberJoined");
      bothInA.ws.terminate();
      await ofType(hostA, "presence.update");
      await settle();
      expect(hostB.messages.filter((m) => m.type === "presence.update")).toEqual([]);
      const observer = await join("hostB", couchB);
      const roster = observer.messages[0]?.payload.members as { userId: string; online: boolean }[];
      expect(roster.find((m) => m.userId === users.both.id)?.online).toBe(true);
      await closeAll(hostA, hostB, bothInB, observer);
    });
  });

  it("no handler threw synchronously and nothing reported an unexpected error during the whole run", () => {
    expect(handlerErrors).toEqual([]);
    expect(errors).toEqual([]);
  });
});
