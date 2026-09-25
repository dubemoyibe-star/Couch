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
import { openSocket, record, settle } from "./ws-test-helpers";

assertDatabaseEnv(process.env, "test-suite");

// Real users, sessions, couches and members in the test database, a real ws
// server, and real client connections. Users, sessions, couches and members are removed afterward. The catalog
// fixture can only be deactivated (see afterAll).
const secret = process.env.BETTER_AUTH_SECRET ?? "";
const baseUrl = process.env.BETTER_AUTH_URL ?? "";
const cookieName = `${baseUrl.startsWith("https:") ? "__Secure-" : ""}better-auth.session_token`;

function cookieFor(token: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${cookieName}=${encodeURIComponent(`${token}.${signature}`)}`;
}

const join = (couchId: string, id?: string) =>
  JSON.stringify({ v: 1, type: "room.join", ...(id ? { id } : {}), payload: { couchId } });

const fixtureFor = (providerId: string): MediaWithLicense => ({
      providerId,
      providerMediaId: "item-1",
      title: "TEST FIXTURE media",
      description: null,
      durationSeconds: 60,
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

describe("room.join with real connections", () => {
  const prisma = getPrismaClient();
  const run = randomBytes(4).toString("hex");
  const providerId = `dbtest-rt-${run}`;
  const fixture = fixtureFor(providerId);
  const day = 24 * 60 * 60 * 1000;
  const users: Record<"host" | "member" | "outsider", { id: string; token: string }> = {
    host: { id: "", token: randomUUID() },
    member: { id: "", token: randomUUID() },
    outsider: { id: "", token: randomUUID() },
  };
  let couchId = "";
  let otherCouchId = "";
  let emptyCouchId = "";
  let mediaId = "";
  let server: RealtimeServer;
  let port = 0;
  let origin = "";
  const sockets: WebSocket[] = [];
  const clock = 1_700_000_000_000;

  async function connect(who: keyof typeof users) {
    const result = await openSocket(port, { origin, cookie: cookieFor(users[who].token) });
    if (!result.ok) throw new Error("expected an open socket");
    sockets.push(result.ws);
    return { ws: result.ws, ...record(result.ws) };
  }

  beforeAll(async () => {
    for (const [label, entry] of Object.entries(users)) {
      const user = await prisma.user.create({
        data: { email: `rt-join-${label}-${run}@example.test`, displayName: `TEST FIXTURE ${label}` },
      });
      entry.id = user.id;
      await prisma.session.create({
        data: { userId: user.id, token: entry.token, expiresAt: new Date(Date.now() + day) },
      });
    }
    const created = await createCouch(prisma, { ownerId: users.host.id, name: "TEST FIXTURE couch" });
    couchId = created.couch.id;
    await joinCouch(prisma, { couchId, userId: users.member.id });
    otherCouchId = (await createCouch(prisma, { ownerId: users.host.id, name: "TEST FIXTURE other" })).couch.id;
    emptyCouchId = (await createCouch(prisma, { ownerId: users.host.id, name: "TEST FIXTURE empty" })).couch.id;

    const media = await upsertCatalogMedia(prisma, fixture);
    if (!media) throw new Error("fixture media was refused");
    mediaId = media.id;
    const set = await setCurrentMedia(prisma, { couchId, actingUserId: users.host.id, mediaId });
    if (!set.ok) throw new Error("could not set media");

    const trusted = getAuth().options.trustedOrigins;
    if (!Array.isArray(trusted) || trusted[0] === undefined) throw new Error("no trusted origin");
    origin = trusted[0];
    const rooms = createRoomHandlers({
      db: prisma,
      store: createInMemoryRoomStore(),
      now: () => clock,
      onError: (error) => {
        throw error;
      },
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
    // The catalog has no delete, and code outside packages/database may not
    // touch its tables, so the fixture is left inactive under its unique
    // `dbtest-rt-` provider id.
    await deactivateMissing(prisma, providerId, []);
    await prisma.$disconnect();
  });

  it("refuses a non-member with not_a_member and leaks no room state", async () => {
    const host = await connect("host");
    host.ws.send(join(couchId));
    await host.waitFor(1);

    const outsider = await connect("outsider");
    outsider.ws.send(join(couchId, "j-1"));
    await outsider.waitFor(1);
    await settle();

    expect(outsider.messages).toEqual([
      {
        v: 1,
        type: "error",
        payload: { code: "not_a_member", message: "You are not a member of this couch.", replyTo: "j-1" },
      },
    ]);
    // Nothing reached the host either: the outsider was never attached.
    expect(host.messages.map((m) => m.type)).toEqual(["room.state"]);

    // Still not attached: a later join is judged again, not refused as joined.
    outsider.ws.send(join(couchId));
    await outsider.waitFor(2);
    expect(outsider.messages[1]?.payload.code).toBe("not_a_member");
    host.ws.close();
    outsider.ws.close();
    await settle();
  });

  it("answers a couch that does not exist the same way as a non-member, so existence does not leak", async () => {
    const outsider = await connect("outsider");
    outsider.ws.send(join(randomUUID()));
    await outsider.waitFor(1);
    expect(outsider.messages[0]?.payload.code).toBe("not_a_member");
    outsider.ws.close();
    await settle();
  });

  it("returns an accurate room.state to a member, with media resolved and playback set", async () => {
    const host = await connect("host");
    host.ws.send(join(couchId, "j-2"));
    const [state] = await host.waitFor(1);

    expect(state?.type).toBe("room.state");
    const payload = state?.payload as {
      couch: unknown;
      self: unknown;
      members: unknown[];
      media: { id: string; title: string; license: { licenseName: string } } | null;
      playback: unknown;
    };
    expect(payload.couch).toEqual({ id: couchId, name: "TEST FIXTURE couch" });
    expect(payload.self).toEqual({ userId: users.host.id, role: "host" });
    expect(payload.members).toEqual([
      { userId: users.host.id, displayName: "TEST FIXTURE host", role: "host", online: true },
      { userId: users.member.id, displayName: "TEST FIXTURE member", role: "participant", online: false },
    ]);
    expect(payload.media?.id).toBe(mediaId);
    expect(payload.media?.title).toBe("TEST FIXTURE media");
    expect(payload.media?.license.licenseName).toBe("TEST FIXTURE License");
    expect(payload.playback).toEqual({
      status: "paused",
      position: 0,
      playbackRate: 1,
      revision: 0,
      serverTimestamp: clock,
    });
    host.ws.close();
    await settle();
  });

  it("returns null media and null playback together for a couch with no media", async () => {
    const host = await connect("host");
    host.ws.send(join(emptyCouchId));
    const [state] = await host.waitFor(1);
    expect(state?.payload).toMatchObject({ media: null, playback: null, self: { role: "host" } });
    host.ws.close();
    await settle();
  });

  it("returns null media and null playback when the current media has been taken down", async () => {
    const takenDown = (await createCouch(prisma, { ownerId: users.host.id, name: "TEST FIXTURE takedown" })).couch;
    const set = await setCurrentMedia(prisma, { couchId: takenDown.id, actingUserId: users.host.id, mediaId });
    if (!set.ok) throw new Error("could not set media");
    await deactivateMissing(prisma, providerId, []);
    try {
      const host = await connect("host");
      host.ws.send(join(takenDown.id));
      const [state] = await host.waitFor(1);
      expect(state?.payload).toMatchObject({ media: null, playback: null });
      host.ws.close();
      await settle();
    } finally {
      await upsertCatalogMedia(prisma, fixture);
    }
  });

  it("announces a new member to those already connected with room.memberJoined and shows who is online", async () => {
    const host = await connect("host");
    host.ws.send(join(couchId));
    await host.waitFor(1);

    const member = await connect("member");
    member.ws.send(join(couchId));
    const [state] = await member.waitFor(1);
    const members = (state?.payload as { members: { userId: string; online: boolean }[] }).members;
    expect(members.map((m) => [m.userId, m.online])).toEqual([
      [users.host.id, true],
      [users.member.id, true],
    ]);

    const [, joined] = await host.waitFor(2);
    expect(joined).toEqual({
      v: 1,
      type: "room.memberJoined",
      payload: {
        member: { userId: users.member.id, displayName: "TEST FIXTURE member", role: "participant", online: true },
      },
    });
    // The joiner is told nothing beyond its own snapshot.
    await settle();
    expect(member.messages).toHaveLength(1);
    host.ws.close();
    member.ws.close();
    await settle();
  });

  it("sends presence.update, not a second room.memberJoined, for a second connection of the same user", async () => {
    const host = await connect("host");
    host.ws.send(join(couchId));
    await host.waitFor(1);

    const tab1 = await connect("member");
    tab1.ws.send(join(couchId));
    await tab1.waitFor(1);
    await host.waitFor(2);

    const tab2 = await connect("member");
    tab2.ws.send(join(couchId));
    const [state] = await tab2.waitFor(1);
    expect(
      (state?.payload as { members: { userId: string; online: boolean }[] }).members.find(
        (m) => m.userId === users.member.id,
      )?.online,
    ).toBe(true);

    await host.waitFor(3);
    expect(host.messages.map((m) => m.type)).toEqual(["room.state", "room.memberJoined", "presence.update"]);
    expect(host.messages[2]).toEqual({
      v: 1,
      type: "presence.update",
      payload: { userId: users.member.id, online: true },
    });
    for (const c of [host, tab1, tab2]) c.ws.close();
    await settle();
  });

  it("goes offline only when the last connection closes, including a raw disconnect", async () => {
    const host = await connect("host");
    host.ws.send(join(couchId));
    await host.waitFor(1);
    const tab1 = await connect("member");
    tab1.ws.send(join(couchId));
    await tab1.waitFor(1);
    const tab2 = await connect("member");
    tab2.ws.send(join(couchId));
    await tab2.waitFor(1);
    await host.waitFor(3);

    // First tab drops with no room.leave: the socket is just cut.
    tab1.ws.terminate();
    await settle(500);
    expect(host.messages).toHaveLength(3);

    // Last tab drops: now, and only now, the member is offline.
    tab2.ws.terminate();
    await host.waitFor(4);
    expect(host.messages[3]).toEqual({
      v: 1,
      type: "presence.update",
      payload: { userId: users.member.id, online: false },
    });

    // Coming back after being fully offline is a first connection again.
    const back = await connect("member");
    back.ws.send(join(couchId));
    await back.waitFor(1);
    await host.waitFor(5);
    expect(host.messages[4]?.type).toBe("room.memberJoined");
    host.ws.close();
    back.ws.close();
    await settle();
  });

  it("refuses a second room.join on a connection, for the same or another couch, and does not attach it", async () => {
    const host = await connect("host");
    host.ws.send(join(couchId));
    await host.waitFor(1);

    host.ws.send(join(otherCouchId, "j-3"));
    host.ws.send(join(couchId, "j-4"));
    await host.waitFor(3);
    expect(host.messages[1]).toMatchObject({ type: "error", payload: { code: "already_joined", replyTo: "j-3" } });
    expect(host.messages[2]).toMatchObject({ type: "error", payload: { code: "already_joined", replyTo: "j-4" } });

    // It was never attached to the other couch: a member there sees no one.
    const watcher = await connect("host");
    watcher.ws.send(join(otherCouchId));
    await watcher.waitFor(1);
    await settle();
    expect(watcher.messages.map((m) => m.type)).toEqual(["room.state"]);
    host.ws.close();
    watcher.ws.close();
    await settle();
  });

  it("answers two room.join frames sent back to back with one room.state and one already_joined", async () => {
    const member = await connect("member");
    member.ws.send(join(couchId));
    member.ws.send(join(couchId));
    await member.waitFor(2);
    await settle();
    expect(member.messages.map((m) => (m.type === "error" ? m.payload.code : m.type)).sort()).toEqual([
      "already_joined",
      "room.state",
    ]);
    member.ws.close();
    await settle();
  });
});
