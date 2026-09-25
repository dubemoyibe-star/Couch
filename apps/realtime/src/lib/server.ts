import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import type { AddressInfo } from "node:net";
import type { ClientMessage, ServerMessage } from "@couch/contracts";
import { WebSocketServer, type WebSocket } from "ws";
import { MAX_FRAME_BYTES, interpretFrame } from "./inbound";

// The identity of an authenticated connection. This is the only source of
// identity for everything the connection sends: it is set once, from the
// validated session at the upgrade, and never from a message payload.
export type Authenticated = { readonly userId: string };

// Resolves the request's cookie to a session, or null when there is none.
export type Authenticate = (headers: Headers) => Promise<Authenticated | null>;

// One open socket, as the message handlers see it. The object itself is the
// connection's identity for bookkeeping. `send` does nothing once the socket is
// no longer open.
export type Connection = { send(message: ServerMessage): void };

export type RealtimeServerOptions = {
  authenticate: Authenticate;
  // Exact origins (scheme, host and port) allowed to open a connection.
  allowedOrigins: readonly string[];
  // Receives every message that parsed, with the connection's identity and the
  // connection itself.
  onMessage?: (identity: Authenticated, message: ClientMessage, connection: Connection) => void;
  // Called once when a connection has closed, however it closed.
  onClose?: (connection: Connection) => void;
  // How long close() waits for clients to finish the close handshake before
  // dropping them.
  closeTimeoutMs?: number;
};

export type RealtimeServer = {
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
  // Number of open WebSocket connections.
  readonly connectionCount: number;
};

const DEFAULT_CLOSE_TIMEOUT_MS = 5000;
// 1001: the endpoint is going away.
const CLOSE_GOING_AWAY = 1001;

const REJECTIONS = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  503: "Service Unavailable",
} as const;

// Refuses the upgrade at the HTTP layer, before the WebSocket handshake
// completes, so a rejected client never holds a WebSocket. This is the pattern
// the ws docs recommend for authentication (`verifyClient` is discouraged).
function reject(socket: Duplex, status: keyof typeof REJECTIONS): void {
  if (socket.destroyed) return;
  socket.once("finish", () => socket.destroy());
  socket.end(
    `HTTP/1.1 ${status} ${REJECTIONS[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}

export function createRealtimeServer(options: RealtimeServerOptions): RealtimeServer {
  const allowed = new Set(options.allowedOrigins);
  const closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
  const identities = new WeakMap<WebSocket, Authenticated>();

  const http: Server = createServer((_req, res) => {
    // Plain HTTP requests are not served: this process only speaks WebSocket.
    res.writeHead(426, { Connection: "close", "Content-Length": 0, Upgrade: "websocket" }).end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  wss.on("connection", (ws: WebSocket) => {
    // An error on one socket (an oversized frame, a reset) must never take
    // the process down. ws closes the connection itself.
    ws.on("error", () => {});
    const connection: Connection = {
      send(message) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
      },
    };
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      const identity = identities.get(ws);
      if (!identity) return;
      const result = interpretFrame(data, isBinary);
      if (!result.ok) {
        ws.send(JSON.stringify(result.reply));
        return;
      }
      options.onMessage?.(identity, result.message, connection);
    });
    ws.on("close", () => options.onClose?.(connection));
  });

  async function onUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    // An error on the raw socket before the handshake finishes (for example a
    // client reset while authentication is pending) must not be unhandled.
    const ignore = () => {};
    socket.on("error", ignore);

    // Origin first: it is a string comparison, so a disallowed page never
    // causes a database read. A missing Origin is refused as well. Browsers
    // always send one, and they are the only clients that attach a user's
    // cookie to a request from another site.
    const origin = request.headers.origin;
    if (origin === undefined || !allowed.has(origin)) return reject(socket, 403);

    const cookie = request.headers.cookie;
    if (!cookie) return reject(socket, 401);

    let identity: Authenticated | null;
    try {
      identity = await options.authenticate(new Headers({ cookie }));
    } catch {
      // The session store failed. This is not the client's fault and not proof
      // the session is bad, so it is not a 401 (which would sign the user out).
      return reject(socket, 503);
    }
    if (!identity) return reject(socket, 401);
    if (socket.destroyed) return;

    wss.handleUpgrade(request, socket, head, (ws) => {
      socket.off("error", ignore);
      // Only the validated user id is kept. Nothing else from the request.
      identities.set(ws, { userId: identity.userId });
      wss.emit("connection", ws, request);
    });
  }

  http.on("upgrade", (request, socket, head) => {
    if (!wss.shouldHandle(request)) return reject(socket, 400);
    onUpgrade(request, socket, head).catch(() => reject(socket, 503));
  });

  return {
    listen(port, host) {
      return new Promise((resolve, reject) => {
        http.once("error", reject);
        http.listen(port, host, () => {
          http.off("error", reject);
          resolve((http.address() as AddressInfo).port);
        });
      });
    },

    async close() {
      // Stop accepting new connections, then ask each client to close. A
      // client that has not finished the close handshake by the timeout is
      // dropped, so shutdown cannot hang on an unresponsive peer.
      const httpClosed = new Promise<void>((resolve) => http.close(() => resolve()));
      http.closeIdleConnections();
      for (const ws of wss.clients) ws.close(CLOSE_GOING_AWAY, "server shutting down");
      const wssClosed = new Promise<void>((resolve) => wss.close(() => resolve()));
      const timer = setTimeout(() => {
        for (const ws of wss.clients) ws.terminate();
      }, closeTimeoutMs);
      try {
        await Promise.all([httpClosed, wssClosed]);
      } finally {
        clearTimeout(timer);
      }
    },

    get connectionCount() {
      return wss.clients.size;
    },
  };
}
