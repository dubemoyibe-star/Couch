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

export function nextClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.once("close", (code) => resolve(code)));
}
