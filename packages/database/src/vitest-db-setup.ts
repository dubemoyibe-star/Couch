import { fileURLToPath } from "node:url";
import { assertDatabaseEnv } from "./env-guard";
import { loadEnvFile } from "./env-files";

// Global setup for `pnpm test:db`. It runs once, before any test file, and
// stops the whole run with a clear message unless the environment is the test
// database. Vitest does not copy dotenv files into process.env, so it loads
// .env.test first. Worker processes started afterwards inherit the values.
// The message comes from the guard, so it never contains a URL or password.
export default function setup(): void {
  loadEnvFile(fileURLToPath(new URL("../../../.env.test", import.meta.url)));

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
