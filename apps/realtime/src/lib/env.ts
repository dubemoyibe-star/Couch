import { fileURLToPath } from "node:url";
import { loadEnvFile } from "@couch/database";

// Next.js loads env files for apps/web itself, and the Prisma CLI and Vitest
// load them through their own configs. The realtime service is a plain Node
// process, so its entry point calls this once before anything reads the
// environment. It uses the same loader as the Prisma configs and the Vitest
// database setup, so a chosen file replaces exported shell values and switches
// DATABASE_URL, DIRECT_URL and COUCH_DB_ENV together.
//
// A missing file is not an error: hosting providers inject the variables and
// ship no file. Returns whether a file was loaded. Never logs file contents.
const REPO_ROOT_FILES = {
  local: new URL("../../../../.env.local", import.meta.url),
  test: new URL("../../../../.env.test", import.meta.url),
} as const;

export function loadRealtimeEnv(name: keyof typeof REPO_ROOT_FILES): boolean {
  return loadEnvFile(fileURLToPath(REPO_ROOT_FILES[name]));
}
