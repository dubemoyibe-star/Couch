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

// Real users, sessions, couches, members and catalog rows in the test database,
// a real ws server, and real client connections. The catalog fixtures can only
// be deactivated afterward (see afterAll).
const secret = process.env.BETTER_AUTH_SECRET ?? "";
const baseUrl = process.env.BETTER_AUTH_URL ?? "";
const cookieName = `${baseUrl.startsWith("https:") ? "__Secure-" : ""}better-auth.session_token`;

function cookieFor(token: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${cookieName}=${encodeURIComponent(`${token}.${signature}`)}`;
}

const send = (type: string, payload: object, id?: string) =>
  JSON.stringify({ v: 1, type, ...(id ? { id } : {}), payload });

const fixtureFor = (providerId: string, providerMediaId: string, intendedUseAllowed = true): MediaWithLicense => ({
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
    intendedUseAllowed,
    commercialUseAllowed: false,
    additionalRestrictions: null,
    verifiedAt: "2026-02-03",
    verificationNotes: null,
  },
});

describe("room.setMedia with real connections", () => {
  const prisma = getPrismaClient();
  const run = randomBytes(4).toString("hex");
  const providerId = `dbtest-rt-sm-${run}`;
  const day = 24 * 60 * 60 * 1000;
  const users: Record<"host" | "member", { id: string; token: string }> = {
    host: { id: "", token: randomUUID() },
    member: { id: "", token: randomUUID() },
  };
  const ids = { a: "", b: "", unauthorized: "", inactive: "", missing: randomUUID() };
  let server: RealtimeServer;
  let port = 0;
  let origin = "";
  let clock = 1_700_000_000_000;
  const errors: unknown[] = [];
  const store: RoomStore = createInMemoryRoomStore();
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

  // A couch (host plus one participant), optionally starting on media A, both joined.
  async function room(withMedia = true) {
    const couchId = (await createCouch(prisma, { ownerId: users.host.id, name: "TEST FIXTURE couch" })).couch.id;
    await joinCouch(prisma, { couchId, userId: users.member.id });
    if (withMedia) {
      const set = await setCurrentMedia(prisma, { couchId, actingUserId: users.host.id, mediaId: ids.a });
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

  type Changed = { media: { id: string } | null; playback: { revision: number } | null };
  const changed = (client: Client) =>
    client.messages.filter((m) => m.type === "room.mediaChanged").map((m) => m.payload as Changed);
  const errorsOf = (client: Client) => client.messages.filter((m) => m.type === "error");
  const closeAll = async (...clients: Client[]) => {
    for (const c of clients) c.ws.close();
    await settle();
  };
  async function joinLate(couchId: string) {
    const late = await connect("member");
    late.ws.send(send("room.join", { couchId }));
    await ofType(late, "room.state");
    return late.messages[0]?.payload as { media: { id: string } | null; playback: unknown; playbackAccess: string };
  }

  beforeAll(async () => {
    for (const [label, entry] of Object.entries(users)) {
      const user = await prisma.user.create({
        data: { email: `rt-sm-${label}-${run}@example.test`, displayName: `TEST FIXTURE ${label}` },
      });
      entry.id = user.id;
      await prisma.session.create({
        data: { userId: user.id, token: entry.token, expiresAt: new Date(Date.now() + day) },
      });
    }
    for (const [key, providerMediaId] of [
      ["a", "item-a"],
      ["b", "item-b"],
      ["unauthorized", "item-u"],
      ["inactive", "item-i"],
    ] as const) {
      const media = await upsertCatalogMedia(prisma, fixtureFor(providerId, providerMediaId));
      if (!media) throw new Error("fixture media was refused");
      ids[key] = media.id;
    }
    // Revoke the license on one row (the upsert stores it and hands back null)
    // and deactivate another, through the repository only.
    if ((await upsertCatalogMedia(prisma, fixtureFor(providerId, "item-u", false))) !== null) {
      throw new Error("expected the revoked fixture to be refused");
    }
    await deactivateMissing(prisma, providerId, ["item-a", "item-b", "item-u"]);

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
    const userIds = Object.values(users).map((user) => user.id);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.couchMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.couch.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await deactivateMissing(prisma, providerId, []);
    await prisma.$disconnect();
  });

  it("host sets media on a couch with none: every connection gets room.mediaChanged with a fresh playback state", async () => {
    const { couchId, host, member } = await room(false);
    host.ws.send(send("room.setMedia", { mediaId: ids.a }));
    await ofType(host, "room.mediaChanged");
    await ofType(member, "room.mediaChanged");
    for (const client of [host, member]) {
      expect(changed(client)).toEqual([
        {
          media: expect.objectContaining({ id: ids.a }),
          playback: { status: "paused", position: 0, playbackRate: 1, revision: 0, serverTimestamp: expect.any(Number) },
        },
      ]);
    }
    expect(store.get(couchId)).toMatchObject({ mediaId: ids.a, playbackAccess: "open" });
    // Transport works on the new room.
    member.ws.send(send("playback.play", { position: 4 }));
    await ofType(host, "playback.sync");
    expect(errors).toEqual([]);
    await closeAll(host, member);
  });

  it("host changes media: playback is reset to the initial state and everyone is told", async () => {
    const { couchId, host, member } = await room();
    host.ws.send(send("playback.play", { position: 30 }));
    host.ws.send(send("playback.seek", { position: 40 }));
    await ofType(member, "playback.sync", 2);
    expect(store.get(couchId)?.playback?.revision).toBe(2);

    host.ws.send(send("room.setMedia", { mediaId: ids.b }));
    for (const client of [host, member]) {
      await ofType(client, "room.mediaChanged");
      expect(changed(client)).toEqual([
        {
          media: expect.objectContaining({ id: ids.b }),
          playback: expect.objectContaining({ revision: 0, status: "paused", position: 0 }),
        },
      ]);
    }
    expect(store.get(couchId)).toMatchObject({
      mediaId: ids.b,
      playback: { revision: 0, status: "paused", position: 0 },
    });

    // A late joiner sees the new media and the reset state.
    const state = await joinLate(couchId);
    expect(state.media?.id).toBe(ids.b);
    expect(state.playback).toMatchObject({ revision: 0 });
    expect(errors).toEqual([]);
    await closeAll(host, member);
  });

  it("host clears media: media and playback are both null, broadcast, and transport is refused afterward", async () => {
    const { couchId, host, member } = await room();
    host.ws.send(send("room.setMedia", { mediaId: null }));
    await ofType(host, "room.mediaChanged");
    await ofType(member, "room.mediaChanged");
    for (const client of [host, member]) expect(changed(client)).toEqual([{ media: null, playback: null }]);
    expect(store.get(couchId)).toMatchObject({ mediaId: null, playback: null });

    member.ws.send(send("playback.play", { position: 1 }, "c-1"));
    await ofType(member, "error");
    expect(errorsOf(member)[0]?.payload).toMatchObject({ code: "media_unavailable", replyTo: "c-1" });

    const state = await joinLate(couchId);
    expect(state.media).toBeNull();
    expect(state.playback).toBeNull();
    expect(errors).toEqual([]);
    await closeAll(host, member);
  });

  it.each([
    ["unauthorized", () => ids.unauthorized],
    ["inactive", () => ids.inactive],
    ["nonexistent", () => ids.missing],
  ])(
    "refuses %s media with media_unavailable: only the requester hears it and the room state is untouched",
    async (_name, pick) => {
      const { couchId, host, member } = await room();
      host.ws.send(send("playback.setAccess", { mode: "host" }));
      await ofType(member, "playback.accessChanged");
      host.ws.send(send("playback.play", { position: 9 }));
      await ofType(member, "playback.sync");
      const before = structuredClone(store.get(couchId));
      expect(before).toMatchObject({ mediaId: ids.a, playbackAccess: "host", playback: { revision: 1 } });

      host.ws.send(send("room.setMedia", { mediaId: pick() }, "s-1"));
      await ofType(host, "error");
      expect(errorsOf(host)[0]?.payload).toMatchObject({ code: "media_unavailable", replyTo: "s-1" });
      await settle();

      expect(store.get(couchId)).toEqual(before);
      for (const client of [host, member]) expect(changed(client)).toEqual([]);
      expect(errorsOf(member)).toEqual([]);
      // The couch row was not changed either: a fresh joiner still gets media A.
      expect((await joinLate(couchId)).media?.id).toBe(ids.a);
      expect(errors).toEqual([]);
      await closeAll(host, member);
    },
  );

  it("refuses room.setMedia from a non-host with forbidden and changes nothing", async () => {
    const { couchId, host, member } = await room();
    const before = structuredClone(store.get(couchId));
    member.ws.send(send("room.setMedia", { mediaId: ids.b }, "f-1"));
    member.ws.send(send("room.setMedia", { mediaId: null }, "f-2"));
    await ofType(member, "error", 2);
    expect(errorsOf(member).map((m) => m.payload)).toEqual([
      { code: "forbidden", message: "Only the host can do that.", replyTo: "f-1" },
      { code: "forbidden", message: "Only the host can do that.", replyTo: "f-2" },
    ]);
    await settle();
    expect(store.get(couchId)).toEqual(before);
    for (const client of [host, member]) expect(changed(client)).toEqual([]);
    expect(errors).toEqual([]);
    await closeAll(host, member);
  });

  it("answers not_joined to room.setMedia from a connection that has not joined", async () => {
    const client = await connect("host");
    client.ws.send(send("room.setMedia", { mediaId: ids.a }, "n-1"));
    await ofType(client, "error");
    expect(errorsOf(client)[0]?.payload).toMatchObject({ code: "not_joined", replyTo: "n-1" });
    await closeAll(client);
  });

  it("the access mode survives a media change: lock, change media, still host; clear, still host; set again, still host", async () => {
    const { couchId, host, member } = await room();
    host.ws.send(send("playback.setAccess", { mode: "host" }));
    await ofType(member, "playback.accessChanged");
    expect(store.get(couchId)?.playbackAccess).toBe("host");

    // Change to another film.
    host.ws.send(send("room.setMedia", { mediaId: ids.b }));
    await ofType(member, "room.mediaChanged");
    expect(store.get(couchId)).toMatchObject({ mediaId: ids.b, playbackAccess: "host" });
    member.ws.send(send("playback.play", { position: 1 }, "l-1"));
    await ofType(member, "error");
    expect(errorsOf(member)[0]?.payload).toMatchObject({ code: "forbidden", replyTo: "l-1" });
    expect((await joinLate(couchId)).playbackAccess).toBe("host");

    // Clear it.
    host.ws.send(send("room.setMedia", { mediaId: null }));
    await ofType(member, "room.mediaChanged", 2);
    expect(store.get(couchId)).toMatchObject({ mediaId: null, playback: null, playbackAccess: "host" });
    expect((await joinLate(couchId)).playbackAccess).toBe("host");

    // Pick media again: still locked.
    host.ws.send(send("room.setMedia", { mediaId: ids.a }));
    await ofType(member, "room.mediaChanged", 3);
    expect(store.get(couchId)).toMatchObject({ mediaId: ids.a, playbackAccess: "host" });
    expect(errors).toEqual([]);
    await closeAll(host, member);
  });
});
