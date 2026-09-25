import { WebSocket } from "ws";

// Real client-side connections for the server tests. Not a test file.

export type OpenResult = { ok: true; ws: WebSocket } | { ok: false; status: number };

// Opens a connection and reports either the open socket or the HTTP status the
// server answered the upgrade with (the handshake never completed).
export function openSocket(
  port: number,
  headers: { origin?: string; cookie?: string },
): Promise<OpenResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`, { headers });
    ws.once("open", () => resolve({ ok: true, ws }));
    ws.once("unexpected-response", (req, res) => {
      res.resume();
      req.destroy();
      resolve({ ok: false, status: res.statusCode ?? 0 });
    });
    ws.once("error", reject);
  });
}

export function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    ws.once("message", (data) => resolve(data.toString()));
    ws.once("error", reject);
  });
}

export type Received = { v: number; type: string; id?: string; payload: Record<string, unknown> };

// Records every message a client socket receives, parsed. Start it right after
// the socket opens so nothing is missed.
export function record(ws: WebSocket) {
  const messages: Received[] = [];
  ws.on("message", (data) => messages.push(JSON.parse(data.toString()) as Received));
  return {
    messages,
    // Resolves with the messages once at least `count` have arrived.
    async waitFor(count: number, timeoutMs = 5000): Promise<Received[]> {
      const started = Date.now();
      const deadline = started + timeoutMs;
      while (messages.length < count) {
        if (Date.now() > deadline) {
          const seen = messages.map((m) => (m.type === "error" ? `error:${String(m.payload.code)}` : m.type));
          throw new Error(
            `expected ${count} message(s), got ${messages.length} after ${Date.now() - started}ms [${seen.join(", ")}], socket readyState ${ws.readyState}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return messages;
    },
  };
}

export const settle = (ms = 300) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function nextClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.once("close", (code) => resolve(code)));
}
