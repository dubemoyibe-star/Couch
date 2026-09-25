import { assertDatabaseEnv } from "@couch/database";
import { loadRealtimeEnv } from "./lib/env";

// Global setup for `pnpm test:db`. Runs once before any test file: loads
// .env.test, then stops the run unless the environment is the test database.
// The message comes from the guard, so it never contains a URL or password.
export default function setup(): void {
  loadRealtimeEnv("test");

  try {
    assertDatabaseEnv(process.env, "test-suite");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "guard failed";
    throw new Error(
      `Database tests refused to run: ${reason}\n` +
        "test:db needs .env.test at the repo root with COUCH_DB_ENV=test and " +
        'DATABASE_URL and DIRECT_URL naming the database "testing". ' +
        "See docs/DEVELOPMENT.md.",
    );
  }
}
