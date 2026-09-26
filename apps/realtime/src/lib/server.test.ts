import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { MAX_CLIENT_MESSAGE_BYTES, type ClientMessage } from "@couch/contracts";
import { MAX_FRAME_BYTES } from "./inbound";
import { createRealtimeServer, type Authenticated, type RealtimeServer } from "./server";
import { nextClose, nextMessage, openSocket } from "./ws-test-helpers";

// A real ws server on an ephemeral port and real client connections. Only the
// session lookup is replaced, so nothing here needs a database. The same
// behavior against a real session is in server.db.test.ts.
const ORIGIN = "http://app.test";

const authenticate = async (headers: Headers): Promise<Authenticated | null> => {
  const cookie = headers.get("cookie");
  if (cookie === "session=good") return { userId: "user-1" };
  if (cookie === "session=broken") throw new Error("store down");
  return null;
};

type Received = { userId: string; message: ClientMessage };

let server: RealtimeServer | undefined;

async function start() {
  const received: Received[] = [];
  server = createRealtimeServer({
    authenticate,
    allowedOrigins: [ORIGIN],
    onMessage: (identity, message) => received.push({ userId: identity.userId, message }),
    closeTimeoutMs: 1000,
  });
  const port = await server.listen(0, "127.0.0.1");
  return { port, received };
}

async function connect(port: number) {
  const result = await openSocket(port, { origin: ORIGIN, cookie: "session=good" });
  if (!result.ok) throw new Error("expected an open socket");
  return result.ws;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
const join = (id: string) => JSON.stringify({ v: 1, type: "room.join", id, payload: { couchId: "couch-1" } });

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("realtime server handshake", () => {
  it("accepts an upgrade with a valid session and an allowed origin", async () => {
    const { port } = await start();
    const ws = await connect(port);
    ws.close();
  });

  it("rejects an upgrade with no cookie with 401", async () => {
    const { port } = await start();
    expect(await openSocket(port, { origin: ORIGIN })).toEqual({ ok: false, status: 401 });
  });

  it("rejects an upgrade whose cookie does not resolve to a session with 401", async () => {
    const { port } = await start();
    expect(await openSocket(port, { origin: ORIGIN, cookie: "session=forged" })).toEqual({
      ok: false,
      status: 401,
    });
  });

  it("rejects a disallowed origin with 403, even with a valid session", async () => {
    const { port } = await start();
    expect(await openSocket(port, { origin: "http://evil.test", cookie: "session=good" })).toEqual({
      ok: false,
      status: 403,
    });
  });

  it("rejects a missing origin with 403", async () => {
    const { port } = await start();
    expect(await openSocket(port, { cookie: "session=good" })).toEqual({ ok: false, status: 403 });
  });

  it("does not consult the session lookup for a disallowed origin", async () => {
    let calls = 0;
    server = createRealtimeServer({
      authenticate: async () => {
        calls += 1;
        return { userId: "user-1" };
      },
      allowedOrigins: [ORIGIN],
    });
    const port = await server.listen(0, "127.0.0.1");
    await openSocket(port, { origin: "http://evil.test", cookie: "session=good" });
    expect(calls).toBe(0);
  });

  it("answers 503, not 401, when the session lookup fails", async () => {
    const { port } = await start();
    expect(await openSocket(port, { origin: ORIGIN, cookie: "session=broken" })).toEqual({
      ok: false,
      status: 503,
    });
  });
});

describe("realtime server messages", () => {
  it("passes a parsed message on with the identity from the connection", async () => {
    const { port, received } = await start();
    const ws = await connect(port);
    // room.kick names a target in its payload. The sender is still the connection's user.
    ws.send(JSON.stringify({ v: 1, type: "room.kick", payload: { userId: "victim" } }));
    ws.send(join("c-1"));
    await settle();
    expect(received.map((r) => r.userId)).toEqual(["user-1", "user-1"]);
    expect(received[0]?.message).toMatchObject({ type: "room.kick", payload: { userId: "victim" } });
    ws.close();
  });

  it("never dispatches a message that claims an identity in its payload", async () => {
    const { port, received } = await start();
    const ws = await connect(port);
    const reply = nextMessage(ws);
    ws.send(JSON.stringify({ v: 1, type: "chat.send", payload: { text: "hi", userId: "someone-else" } }));
    expect(JSON.parse(await reply)).toMatchObject({ type: "error", payload: { code: "invalid_payload" } });
    expect(received).toEqual([]);
    ws.close();
  });

  it("answers malformed JSON with invalid_json and keeps the connection open", async () => {
    const { port, received } = await start();
    const ws = await connect(port);
    const reply = nextMessage(ws);
    ws.send("{not json");
    expect(JSON.parse(await reply)).toEqual({
      v: 1,
      type: "error",
      payload: { code: "invalid_json", message: "Message is not a valid JSON object." },
    });
    ws.send(join("c-2"));
    await settle();
    expect(received).toHaveLength(1);
    ws.close();
  });

  it("answers a message over the client cap with message_too_large and keeps the connection open", async () => {
    const { port, received } = await start();
    const ws = await connect(port);
    const reply = nextMessage(ws);
    ws.send("x".repeat(MAX_CLIENT_MESSAGE_BYTES + 1));
    expect(JSON.parse(await reply)).toEqual({
      v: 1,
      type: "error",
      payload: { code: "message_too_large", message: "Message exceeds the maximum size." },
    });
    ws.send(join("c-3"));
    await settle();
    expect(received).toHaveLength(1);
    ws.close();
  });

  it("has the socket drop a frame over the socket limit with close code 1009", async () => {
    const { port } = await start();
    const ws = await connect(port);
    const closed = nextClose(ws);
    ws.send("x".repeat(MAX_FRAME_BYTES + 1));
    expect(await closed).toBe(1009);
  });

  it("answers a binary frame with invalid_json", async () => {
    const { port } = await start();
    const ws = await connect(port);
    const reply = nextMessage(ws);
    ws.send(Buffer.from([1, 2, 3]));
    expect(JSON.parse(await reply)).toMatchObject({ type: "error", payload: { code: "invalid_json" } });
    ws.close();
  });
});

describe("realtime server shutdown", () => {
  it("closes open connections with 1001 and resolves", async () => {
    const { port } = await start();
    const ws = await connect(port);
    const closed = nextClose(ws);
    await server?.close();
    expect(await closed).toBe(1001);
    expect(server?.connectionCount).toBe(0);
  });

  it("stops accepting new connections", async () => {
    const { port } = await start();
    await server?.close();
    await expect(openSocket(port, { origin: ORIGIN, cookie: "session=good" })).rejects.toThrow();
  });
});

describe("a message handler that throws", () => {
  it("is reported and does not crash the process or close the connection", async () => {
    const failures: unknown[] = [];
    let calls = 0;
    server = createRealtimeServer({
      authenticate,
      allowedOrigins: [ORIGIN],
      onMessage: () => {
        calls += 1;
        if (calls === 1) throw new Error("boom");
      },
      onHandlerError: (error) => failures.push(error),
      closeTimeoutMs: 1000,
    });
    const port = await server.listen(0, "127.0.0.1");
    const ws = await connect(port);
    ws.send(join("a"));
    ws.send(join("b"));
    await settle();
    expect(failures).toHaveLength(1);
    expect(calls).toBe(2);
    expect(ws.readyState).toBe(ws.OPEN);
    ws.close();
  });
});

describe("internal teardown endpoint", () => {
  // A throwaway value per run. Never printed or asserted on in a message.
  const secret = randomBytes(24).toString("base64");
  const HEADER = "x-internal-secret";

  async function startInternal(withInternal = true) {
    const torn: string[] = [];
    server = createRealtimeServer({
      authenticate,
      allowedOrigins: [ORIGIN],
      closeTimeoutMs: 1000,
      ...(withInternal ? { internal: { secret, onTeardown: (couchId: string) => void torn.push(couchId) } } : {}),
    });
    const port = await server.listen(0, "127.0.0.1");
    const call = async (path: string, init: { method?: string; secret?: string | null } = {}) => {
      const headers: Record<string, string> = {};
      if (init.secret !== null) headers[HEADER] = init.secret ?? secret;
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: init.method ?? "POST", headers });
      return { status: res.status, body: await res.text(), allow: res.headers.get("allow") };
    };
    return { port, torn, call };
  }

  it("tears down with a valid secret, answering 204 and calling the teardown once", async () => {
    const { torn, call } = await startInternal();
    expect(await call("/internal/couches/couch-9/teardown")).toEqual({ status: 204, body: "", allow: null });
    expect(torn).toEqual(["couch-9"]);
  });

  it("refuses a missing or wrong secret with the same 401, whatever the path, and never tears down", async () => {
    const { torn, call } = await startInternal();
    const paths = ["/internal/couches/couch-9/teardown", "/internal/couches/other/teardown", "/internal/nothing", "/internal/"];
    const answers = [];
    for (const path of paths) {
      answers.push(await call(path, { secret: null }));
      answers.push(await call(path, { secret: "wrong" }));
      answers.push(await call(path, { secret: `${secret}x` }));
      answers.push(await call(path, { secret: "", method: "GET" }));
    }
    for (const answer of answers) expect(answer).toEqual({ status: 401, body: "", allow: null });
    expect(torn).toEqual([]);
  });

  it("answers a valid secret with 404 for an unknown internal path, 405 for a wrong method and 400 for a bad id", async () => {
    const { torn, call } = await startInternal();
    expect((await call("/internal/nothing")).status).toBe(404);
    expect((await call("/internal/couches/c/teardown/extra")).status).toBe(404);
    expect(await call("/internal/couches/c/teardown", { method: "GET" })).toMatchObject({ status: 405, allow: "POST" });
    expect((await call("/internal/couches/%E0%A4%A/teardown")).status).toBe(400);
    expect((await call(`/internal/couches/${"a".repeat(500)}/teardown`)).status).toBe(400);
    expect(torn).toEqual([]);
  });

  it("answers 500 when the teardown throws, and keeps serving", async () => {
    server = createRealtimeServer({
      authenticate,
      allowedOrigins: [ORIGIN],
      closeTimeoutMs: 1000,
      internal: {
        secret,
        onTeardown: () => {
          throw new Error("boom");
        },
      },
    });
    const port = await server.listen(0, "127.0.0.1");
    const res = await fetch(`http://127.0.0.1:${port}/internal/couches/c/teardown`, { method: "POST", headers: { [HEADER]: secret } });
    expect(res.status).toBe(500);
    await res.arrayBuffer();
    const ws = await connect(port);
    ws.close();
  });

  it("is not served when no internal options are given", async () => {
    const { call } = await startInternal(false);
    expect((await call("/internal/couches/c/teardown")).status).toBe(426);
  });

  it("is not reachable through the WebSocket upgrade: an upgrade to that path is an ordinary connection", async () => {
    const { port, torn } = await startInternal();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/internal/couches/c/teardown`, {
      headers: { origin: ORIGIN, cookie: "session=good", [HEADER]: secret },
    });
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    await settle();
    expect(torn).toEqual([]);
    ws.close();
  });
});
