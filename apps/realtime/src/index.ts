import { getAuth } from "./lib/auth";
import { loadRealtimeEnv } from "./lib/env";
import { createRealtimeServer } from "./lib/server";
import { authenticateSession } from "./lib/session";

// The port the WebSocket server listens on. `PORT` is what hosting providers
// inject. The default sits next to apps/web, which uses 3000.
const DEFAULT_PORT = 3001;

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer from 0 to 65535");
  }
  return port;
}

async function main(): Promise<void> {
  loadRealtimeEnv("local");

  // Built here so a missing secret or base URL stops the process at start-up
  // instead of failing the first connection. The origins a page may connect
  // from are the shared auth core's trusted origins, the same list apps/web
  // uses.
  const trusted = getAuth().options.trustedOrigins;
  if (!Array.isArray(trusted)) throw new Error("trustedOrigins must be a list of origins");

  const server = createRealtimeServer({
    authenticate: authenticateSession,
    allowedOrigins: trusted,
    // There are no message handlers yet, so a message that parsed goes nowhere.
    onMessage: () => {},
  });

  const port = await server.listen(readPort(process.env.PORT));
  console.log(`[realtime] listening on port ${port}`);

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[realtime] ${signal} received, closing ${server.connectionCount} connection(s)`);
    server.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(`[realtime] shutdown failed: ${error instanceof Error ? error.message : "unknown error"}`);
        process.exit(1);
      },
    );
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error(`[realtime] failed to start: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
