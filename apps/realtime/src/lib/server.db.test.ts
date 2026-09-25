import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_CLIENT_MESSAGE_BYTES, type ClientMessage } from "@couch/contracts";
import { assertDatabaseEnv, getPrismaClient } from "@couch/database";
import { getAuth } from "./auth";
import { createRealtimeServer, type RealtimeServer } from "./server";
import { authenticateSession } from "./session";
import { nextMessage, openSocket } from "./ws-test-helpers";

assertDatabaseEnv(process.env, "test-suite");

// Real sessions in the test database, the real Better Auth instance, and a real
// ws server on an ephemeral port with real client connections.
const secret = process.env.BETTER_AUTH_SECRET ?? "";
const baseUrl = process.env.BETTER_AUTH_URL ?? "";
// The base URL decides the cookie name (an https URL adds `__Secure-`).
const cookieName = `${baseUrl.startsWith("https:") ? "__Secure-" : ""}better-auth.session_token`;

// Better Auth signs the cookie as `<token>.<base64 HMAC-SHA256 of the token>`,
// URL-encoded. Building it here, with a key of the caller's choosing, lets a
// test produce both a genuine cookie and a forged one.
function cookieFor(token: string, key: string = secret): string {
  const signature = createHmac("sha256", key).update(token).digest("base64");
  return `${cookieName}=${encodeURIComponent(`${token}.${signature}`)}`;
}

describe("realtime server with real sessions", () => {
  const prisma = getPrismaClient();
  const email = `realtime-${randomUUID()}@example.test`;
  const day = 24 * 60 * 60 * 1000;
  let userId = "";
  let validToken = "";
  let expiredToken = "";
  let server: RealtimeServer;
  let port = 0;
  let origin = "";
  const received: { userId: string; message: ClientMessage }[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email, displayName: "Realtime Test" } });
    userId = user.id;
    validToken = randomUUID();
    expiredToken = randomUUID();
    await prisma.session.create({
      data: { userId, token: validToken, expiresAt: new Date(Date.now() + day) },
    });
    await prisma.session.create({
      data: { userId, token: expiredToken, expiresAt: new Date(Date.now() - day) },
    });

    // The origins come from the same shared auth core apps/web uses.
    const trusted = getAuth().options.trustedOrigins;
    if (!Array.isArray(trusted) || trusted[0] === undefined) throw new Error("no trusted origin");
    origin = trusted[0];

    server = createRealtimeServer({
      authenticate: authenticateSession,
      allowedOrigins: trusted,
      onMessage: (identity, message) => received.push({ userId: identity.userId, message }),
      closeTimeoutMs: 1000,
    });
    port = await server.listen(0, "127.0.0.1");
  });

  afterAll(async () => {
    await server?.close();
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("accepts an upgrade with a valid session cookie", async () => {
    const result = await openSocket(port, { origin, cookie: cookieFor(validToken) });
    expect(result.ok).toBe(true);
    if (result.ok) result.ws.close();
  });

  it("attaches the session's user id to the connection, not anything the client sends", async () => {
    const result = await openSocket(port, { origin, cookie: cookieFor(validToken) });
    if (!result.ok) throw new Error("expected an open socket");
    received.length = 0;
    result.ws.send(JSON.stringify({ v: 1, type: "room.kick", payload: { userId: "victim" } }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received).toHaveLength(1);
    expect(received[0]?.userId).toBe(userId);
    result.ws.close();
  });

  it("rejects an upgrade with no cookie", async () => {
    expect(await openSocket(port, { origin })).toEqual({ ok: false, status: 401 });
  });

  it("rejects an invalid session: a token that has no session row", async () => {
    expect(await openSocket(port, { origin, cookie: cookieFor(randomUUID()) })).toEqual({
      ok: false,
      status: 401,
    });
  });

  it("rejects a forged cookie: a real token signed with the wrong key", async () => {
    expect(await openSocket(port, { origin, cookie: cookieFor(validToken, "not-the-secret") })).toEqual({
      ok: false,
      status: 401,
    });
  });

  it("rejects an unsigned cookie: a real token with no signature", async () => {
    expect(await openSocket(port, { origin, cookie: `${cookieName}=${validToken}` })).toEqual({
      ok: false,
      status: 401,
    });
  });

  it("rejects an expired session", async () => {
    expect(await openSocket(port, { origin, cookie: cookieFor(expiredToken) })).toEqual({
      ok: false,
      status: 401,
    });
  });

  it("rejects a disallowed origin, even with a valid session", async () => {
    expect(await openSocket(port, { origin: "https://evil.example", cookie: cookieFor(validToken) })).toEqual({
      ok: false,
      status: 403,
    });
  });

  it("answers a message over the client cap with message_too_large and keeps the connection", async () => {
    const result = await openSocket(port, { origin, cookie: cookieFor(validToken) });
    if (!result.ok) throw new Error("expected an open socket");
    const reply = nextMessage(result.ws);
    result.ws.send("x".repeat(MAX_CLIENT_MESSAGE_BYTES + 1));
    expect(JSON.parse(await reply)).toEqual({
      v: 1,
      type: "error",
      payload: { code: "message_too_large", message: "Message exceeds the maximum size." },
    });
    expect(result.ws.readyState).toBe(result.ws.OPEN);
    result.ws.close();
  });

  it("answers malformed JSON with invalid_json", async () => {
    const result = await openSocket(port, { origin, cookie: cookieFor(validToken) });
    if (!result.ok) throw new Error("expected an open socket");
    const reply = nextMessage(result.ws);
    result.ws.send("{not json");
    expect(JSON.parse(await reply)).toEqual({
      v: 1,
      type: "error",
      payload: { code: "invalid_json", message: "Message is not a valid JSON object." },
    });
    result.ws.close();
  });
});
