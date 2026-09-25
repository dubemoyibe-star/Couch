import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertDatabaseEnv,
  createCouch,
  deactivateMissing,
  getPrismaClient,
  joinCouch,
  setCurrentMedia,
  upsertCatalogMedia,
} from "@couch/database";
import type { MediaWithLicense } from "@couch/contracts";
import { createInMemoryRoomStore, type RoomStore } from "@couch/shared";
import { getAuth } from "./auth";
import { createRoomHandlers } from "./room-handlers";
import { createRealtimeServer, type RealtimeServer } from "./server";
import { authenticateSession } from "./session";
import { openSocket, record, settle } from "./ws-test-helpers";

assertDatabaseEnv(process.env, "test-suite");

// Real users, sessions, couches and members in the test database, a real ws
// server, and real client connections. The catalog fixture can only be
// deactivated afterward (see afterAll).
const secret = process.env.BETTER_AUTH_SECRET ?? "";
const baseUrl = process.env.BETTER_AUTH_URL ?? "";
const cookieName = `${baseUrl.startsWith("https:") ? "__Secure-" : ""}better-auth.session_token`;

function cookieFor(token: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${cookieName}=${encodeURIComponent(`${token}.${signature}`)}`;
}

const send = (type: string, payload: object, id?: string) =>
  JSON.stringify({ v: 1, type, ...(id ? { id } : {}), payload });

const fixtureFor = (providerId: string): MediaWithLicense => ({
  providerId,
  providerMediaId: "item-1",
  title: "TEST FIXTURE media",
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

describe("playback commands and access mode with real connections", () => {
  const prisma = getPrismaClient();
  const run = randomBytes(4).toString("hex");
  const providerId = `dbtest-rt-pb-${run}`;
  const day = 24 * 60 * 60 * 1000;
  const users: Record<"host" | "member", { id: string; token: string }> = {
    host: { id: "", token: randomUUID() },
    member: { id: "", token: randomUUID() },
  };
  let mediaId = "";
  let server: RealtimeServer;
  let port = 0;
  let origin = "";
  let clock = 1_700_000_000_000;
  const errors: unknown[] = [];
  // The real in-memory store, except that while `storeBroken` is set every write
  // throws, to reach the unexpected-failure path with real connections.
  let storeBroken = false;
  const inner = createInMemoryRoomStore();
  const store: RoomStore = {
    get: (couchId) => inner.get(couchId),
    set: (state) => {
      if (storeBroken) throw new Error("store down");
      inner.set(state);
    },
  };
  const sockets: WebSocket[] = [];

  async function connect(who: keyof typeof users) {
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

  // A couch (host plus one participant), optionally with media, both joined.
  async function room(withMedia = true) {
    const couchId = (await createCouch(prisma, { ownerId: users.host.id, name: "TEST FIXTURE couch" })).couch.id;
    await joinCouch(prisma, { couchId, userId: users.member.id });
    if (withMedia) {
      const set = await setCurrentMedia(prisma, { couchId, actingUserId: users.host.id, mediaId });
      if (!set.ok) throw new Error("could not set media");
    }
    const host = await connect("host");
    host.ws.send(send("room.join", { couchId }));
    await ofType(host, "room.state");
    const member = await connect("member");
    member.ws.send(send("room.join", { couchId }));
    await ofType(member, "room.state");
    await ofType(host, "room.memberJoined");
    return { couchId, host, member };
  }

  type SyncState = { revision: number; status: string; position: number; playbackRate: number };
  const syncs = (client: Client) =>
    client.messages.filter((m) => m.type === "playback.sync").map((m) => (m.payload as { state: SyncState }).state);
  const errorsOf = (client: Client) => client.messages.filter((m) => m.type === "error");
  const accessOf = (client: Client) => (client.messages[0]?.payload as { playbackAccess: string }).playbackAccess;

  beforeAll(async () => {
    for (const [label, entry] of Object.entries(users)) {
      const user = await prisma.user.create({
        data: { email: `rt-pb-${label}-${run}@example.test`, displayName: `TEST FIXTURE ${label}` },
      });
      entry.id = user.id;
      await prisma.session.create({
        data: { userId: user.id, token: entry.token, expiresAt: new Date(Date.now() + day) },
      });
    }
    const media = await upsertCatalogMedia(prisma, fixtureFor(providerId));
    if (!media) throw new Error("fixture media was refused");
    mediaId = media.id;

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
    await deactivateMissing(prisma, providerId, []);
    await prisma.$disconnect();
  });

  it("room.state starts open, and a non-host runs every transport command; everyone gets each sync with the next revision", async () => {
    const { host, member } = await room();
    expect(accessOf(host)).toBe("open");
    expect(accessOf(member)).toBe("open");

    member.ws.send(send("playback.play", { position: 10 }));
    member.ws.send(send("playback.seek", { position: 42 }));
    member.ws.send(send("playback.setRate", { rate: 1.5 }));
    member.ws.send(send("playback.pause", { position: 50 }));
    await ofType(host, "playback.sync", 4);
    await ofType(member, "playback.sync", 4);

    for (const client of [host, member]) expect(syncs(client).map((s) => s.revision)).toEqual([1, 2, 3, 4]);
    expect(syncs(member)[3]).toMatchObject({ status: "paused", position: 50, playbackRate: 1.5 });

    // The host can act in open mode too.
    host.ws.send(send("playback.play", { position: 5 }));
    await ofType(member, "playback.sync", 5);
    await ofType(host, "playback.sync", 5);
    expect(syncs(member)[4]?.revision).toBe(5);
    expect(errors).toEqual([]);
    host.ws.close();
    member.ws.close();
    await settle();
  });

  it("host locks the room: everyone gets accessChanged, the non-host is refused with forbidden and state is unchanged, host still works", async () => {
    const { couchId, host, member } = await room();
    host.ws.send(send("playback.play", { position: 1 }));
    await ofType(member, "playback.sync");
    await ofType(host, "playback.sync");

    host.ws.send(send("playback.setAccess", { mode: "host" }));
    for (const client of [host, member]) {
      expect(await ofType(client, "playback.accessChanged")).toEqual([
        { v: 1, type: "playback.accessChanged", payload: { mode: "host" } },
      ]);
    }

    const attempts: [string, object][] = [
      ["playback.play", { position: 99 }],
      ["playback.pause", { position: 99 }],
      ["playback.seek", { position: 99 }],
      ["playback.setRate", { rate: 2 }],
    ];
    for (const [i, [type, payload]] of attempts.entries()) member.ws.send(send(type, payload, `m-${i}`));
    await ofType(member, "error", 4);
    expect(errorsOf(member).map((m) => m.payload)).toEqual(
      [0, 1, 2, 3].map((i) => ({ code: "forbidden", message: "Only the host can do that.", replyTo: `m-${i}` })),
    );
    await settle();
    // Nothing was broadcast for the refusals.
    expect(syncs(host)).toHaveLength(1);

    // The host's next command is revision 2: the four refusals changed nothing.
    host.ws.send(send("playback.seek", { position: 7 }));
    await ofType(host, "playback.sync", 2);
    await ofType(member, "playback.sync", 2);
    for (const client of [host, member]) expect(syncs(client).map((s) => s.revision)).toEqual([1, 2]);

    // A joiner learns the mode from room.state.
    const late = await connect("member");
    late.ws.send(send("room.join", { couchId }));
    await ofType(late, "room.state");
    expect(accessOf(late)).toBe("host");
    expect(errors).toEqual([]);
    for (const c of [host, member, late]) c.ws.close();
    await settle();
  });

  it("host reopens the room and the non-host can act again", async () => {
    const { host, member } = await room();
    host.ws.send(send("playback.setAccess", { mode: "host" }));
    await ofType(member, "playback.accessChanged");
    member.ws.send(send("playback.play", { position: 3 }));
    await ofType(member, "error");

    host.ws.send(send("playback.setAccess", { mode: "open" }));
    await ofType(member, "playback.accessChanged", 2);
    await ofType(host, "playback.accessChanged", 2);
    expect(member.messages.filter((m) => m.type === "playback.accessChanged").map((m) => m.payload.mode)).toEqual([
      "host",
      "open",
    ]);

    member.ws.send(send("playback.play", { position: 3 }));
    await ofType(host, "playback.sync");
    await ofType(member, "playback.sync");
    // Revision 1: the refused attempt while locked did not count.
    for (const client of [host, member]) expect(syncs(client).map((s) => s.revision)).toEqual([1]);
    expect(errors).toEqual([]);
    host.ws.close();
    member.ws.close();
    await settle();
  });

  it("refuses playback.setAccess from a non-host with forbidden and leaves the mode alone", async () => {
    const { host, member } = await room();
    member.ws.send(send("playback.setAccess", { mode: "host" }, "a-1"));
    expect(await ofType(member, "error")).toEqual([
      { v: 1, type: "error", payload: { code: "forbidden", message: "Only the host can do that.", replyTo: "a-1" } },
    ]);
    await settle();
    expect(host.messages.filter((m) => m.type === "playback.accessChanged")).toEqual([]);
    // Still open: the non-host can still act.
    member.ws.send(send("playback.play", { position: 1 }));
    await ofType(host, "playback.sync");
    expect(errors).toEqual([]);
    host.ws.close();
    member.ws.close();
    await settle();
  });

  it("refuses every command on a couch with no media with media_unavailable", async () => {
    const { host, member } = await room(false);
    const commands: [string, object][] = [
      ["playback.play", { position: 1 }],
      ["playback.pause", { position: 1 }],
      ["playback.seek", { position: 1 }],
      ["playback.setRate", { rate: 1 }],
    ];
    for (const [type, payload] of commands) {
      host.ws.send(send(type, payload));
      member.ws.send(send(type, payload));
    }
    await ofType(host, "error", 4);
    await ofType(member, "error", 4);
    for (const client of [host, member]) {
      expect(errorsOf(client).map((m) => m.payload.code)).toEqual(Array(4).fill("media_unavailable"));
      expect(syncs(client)).toEqual([]);
    }
    host.ws.close();
    member.ws.close();
    await settle();
  });

  it("answers internal_error when a command fails unexpectedly, changes nothing, and keeps working afterward", async () => {
    const { host, member } = await room();
    storeBroken = true;
    member.ws.send(send("playback.play", { position: 1 }, "e-1"));
    host.ws.send(send("playback.setAccess", { mode: "host" }, "e-2"));
    await ofType(member, "error");
    await ofType(host, "error");
    storeBroken = false;
    expect(errorsOf(member).map((m) => m.payload)).toEqual([
      { code: "internal_error", message: "The server could not complete the request.", replyTo: "e-1" },
    ]);
    expect(errorsOf(host).map((m) => m.payload)).toEqual([
      { code: "internal_error", message: "The server could not complete the request.", replyTo: "e-2" },
    ]);
    expect(errors).toHaveLength(2);
    errors.length = 0;
    await settle();
    expect(syncs(host)).toEqual([]);
    expect(host.messages.filter((m) => m.type === "playback.accessChanged")).toEqual([]);

    member.ws.send(send("playback.play", { position: 1 }));
    await ofType(host, "playback.sync");
    expect(syncs(host).map((s) => s.revision)).toEqual([1]);
    host.ws.close();
    member.ws.close();
    await settle();
  });

  it("answers not_joined to a playback command from a connection that has not joined", async () => {
    const client = await connect("host");
    client.ws.send(send("playback.play", { position: 1 }, "n-1"));
    expect(await ofType(client, "error")).toEqual([
      {
        v: 1,
        type: "error",
        payload: { code: "not_joined", message: "This connection has not joined a couch.", replyTo: "n-1" },
      },
    ]);
    client.ws.close();
    await settle();
  });
});
