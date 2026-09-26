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
import { createInMemoryRoomStore } from "@couch/shared";
import { getAuth } from "./auth";
import { createRoomHandlers } from "./room-handlers";
import { createRealtimeServer, type RealtimeServer } from "./server";
import { authenticateSession } from "./session";
import { nextClose, openSocket, record, settle } from "./ws-test-helpers";

assertDatabaseEnv(process.env, "test-suite");

// Real users, sessions, couches, members and catalog rows in the test database,
// a real ws server with the internal endpoint, and real client connections. Real
// membership is needed because the final check joins the couch again through
// room.join, which reads the database.
const authSecret = process.env.BETTER_AUTH_SECRET ?? "";
const baseUrl = process.env.BETTER_AUTH_URL ?? "";
const cookieName = `${baseUrl.startsWith("https:") ? "__Secure-" : ""}better-auth.session_token`;
// A throwaway value for this run. Never printed.
const internalSecret = randomBytes(24).toString("base64");

function cookieFor(token: string): string {
  const signature = createHmac("sha256", authSecret).update(token).digest("base64");
  return `${cookieName}=${encodeURIComponent(`${token}.${signature}`)}`;
}

const send = (type: string, payload: object, id?: string) =>
  JSON.stringify({ v: 1, type, ...(id ? { id } : {}), payload });

const fixture: MediaWithLicense = {
  providerId: "",
  providerMediaId: "item-a",
  title: "TEST FIXTURE media item-a",
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
};

describe("couch room teardown with real connections", () => {
  const prisma = getPrismaClient();
  const run = randomBytes(4).toString("hex");
  const providerId = `dbtest-rt-td-${run}`;
  const day = 24 * 60 * 60 * 1000;
  const users: Record<"host" | "member", { id: string; token: string }> = {
    host: { id: "", token: randomUUID() },
    member: { id: "", token: randomUUID() },
  };
  let mediaId = "";
  let server: RealtimeServer;
  let port = 0;
  let origin = "";
  const errors: unknown[] = [];
  const store = createInMemoryRoomStore();
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

  // A couch (host plus one participant), optionally on media, both joined.
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

  const teardown = (couchId: string, secret: string | null = internalSecret) =>
    fetch(`http://127.0.0.1:${port}/internal/couches/${couchId}/teardown`, {
      method: "POST",
      headers: secret === null ? {} : { "x-internal-secret": secret },
    }).then(async (res) => ({ status: res.status, body: await res.text() }));

  const closeAll = async (...clients: Client[]) => {
    for (const c of clients) c.ws.close();
    await settle();
  };

  beforeAll(async () => {
    for (const [label, entry] of Object.entries(users)) {
      const user = await prisma.user.create({
        data: { email: `rt-td-${label}-${run}@example.test`, displayName: `TEST FIXTURE ${label}` },
      });
      entry.id = user.id;
      await prisma.session.create({
        data: { userId: user.id, token: entry.token, expiresAt: new Date(Date.now() + day) },
      });
    }
    const media = await upsertCatalogMedia(prisma, { ...fixture, providerId });
    if (!media) throw new Error("fixture media was refused");
    mediaId = media.id;

    const trusted = getAuth().options.trustedOrigins;
    if (!Array.isArray(trusted) || trusted[0] === undefined) throw new Error("no trusted origin");
    origin = trusted[0];
    const rooms = createRoomHandlers({
      db: prisma,
      store,
      now: () => 1_700_000_000_000,
      onError: (error) => errors.push(error),
    });
    server = createRealtimeServer({
      authenticate: authenticateSession,
      allowedOrigins: trusted,
      onMessage: rooms.onMessage,
      onClose: rooms.onClose,
      internal: { secret: internalSecret, onTeardown: rooms.teardown },
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

  it("an active room is torn down: every connection gets room.deleted and is closed, and the room leaves the store", async () => {
    const { couchId, host, member } = await room();
    // Move playback on, so stale state would be visible if it survived.
    host.ws.send(send("playback.play", { position: 42 }));
    await ofType(member, "playback.sync");
    expect(store.get(couchId)?.playback?.status).toBe("playing");
    const hostClosed = nextClose(host.ws);
    const memberClosed = nextClose(member.ws);

    expect(await teardown(couchId)).toEqual({ status: 204, body: "" });

    for (const client of [host, member]) expect(await ofType(client, "room.deleted")).toEqual([{ v: 1, type: "room.deleted", payload: {} }]);
    expect(await Promise.all([hostClosed, memberClosed])).toEqual([1000, 1000]);
    expect(store.get(couchId)).toBeUndefined();
    // Nothing was announced to peers that were being torn down as well.
    for (const client of [host, member]) {
      expect(client.messages.filter((m) => m.type === "presence.update" || m.type === "room.memberLeft")).toEqual([]);
    }

    // The couch still exists in the database here, so a new join gets a fresh room.
    const again = await connect("host");
    again.ws.send(send("room.join", { couchId }));
    const state = (await ofType(again, "room.state"))[0]?.payload as { playback: Record<string, unknown> | null };
    expect(state.playback).toMatchObject({ status: "paused", position: 0, revision: 0 });
    expect(store.get(couchId)?.playback).toMatchObject({ status: "paused", position: 0, revision: 0 });
    await closeAll(again);
    expect(errors).toEqual([]);
  });

  it("connections on a couch that never had media (no stored room) are torn down too", async () => {
    const { couchId, host, member } = await room(false);
    expect(store.get(couchId)).toBeUndefined();
    const closed = Promise.all([nextClose(host.ws), nextClose(member.ws)]);
    expect((await teardown(couchId)).status).toBe(204);
    await ofType(host, "room.deleted");
    await ofType(member, "room.deleted");
    expect(await closed).toEqual([1000, 1000]);
  });

  it("a teardown for a couch with no room and no connections is a safe no-op", async () => {
    // Sockets the previous test had closed may still be finishing their close
    // handshake, so wait for the count to stop moving before measuring.
    await settle();
    const before = server.connectionCount;
    expect(await teardown(randomUUID())).toEqual({ status: 204, body: "" });
    expect(server.connectionCount).toBe(before);
  });

  it("a missing or wrong secret is refused the same way for a live room and an unknown couch, and changes nothing", async () => {
    const { couchId, host, member } = await room();
    const unknown = randomUUID();
    const answers = [
      await teardown(couchId, null),
      await teardown(couchId, "wrong"),
      await teardown(unknown, null),
      await teardown(unknown, "wrong"),
    ];
    for (const answer of answers) expect(answer).toEqual({ status: 401, body: "" });
    await settle();
    expect(store.get(couchId)).toBeDefined();
    expect(host.ws.readyState).toBe(host.ws.OPEN);
    expect(member.ws.readyState).toBe(member.ws.OPEN);
    expect(host.messages.filter((m) => m.type === "room.deleted")).toEqual([]);
    await closeAll(host, member);
  });

  it("two other rooms are unaffected by a teardown of a third", async () => {
    const one = await room();
    const two = await room();
    const target = await room();
    const oneBefore = store.get(one.couchId);
    const twoBefore = store.get(two.couchId);

    expect((await teardown(target.couchId)).status).toBe(204);
    await ofType(target.host, "room.deleted");
    await ofType(target.member, "room.deleted");
    await settle();

    expect(store.get(target.couchId)).toBeUndefined();
    expect(store.get(one.couchId)).toEqual(oneBefore);
    expect(store.get(two.couchId)).toEqual(twoBefore);
    for (const client of [one.host, one.member, two.host, two.member]) {
      expect(client.ws.readyState).toBe(client.ws.OPEN);
      expect(client.messages.filter((m) => m.type === "room.deleted")).toEqual([]);
    }
    // Still fully working: a command in one room reaches its members.
    one.host.ws.send(send("playback.play", { position: 7 }));
    await ofType(one.member, "playback.sync");
    await closeAll(one.host, one.member, two.host, two.member);
  });
});
