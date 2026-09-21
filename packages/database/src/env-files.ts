import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Loads a dotenv file into `target`. Values from the file replace values
// already in `target`, so choosing a file (.env.local or .env.test) always
// switches DATABASE_URL, DIRECT_URL and COUCH_DB_ENV together, even if the
// shell exported different ones. A missing file is not an error: hosting
// providers inject the variables directly and ship no file.
// Returns whether a file was loaded. It never logs file contents.
export function loadEnvFile(
  path: string,
  target: Record<string, string | undefined> = process.env,
): boolean {
  if (!existsSync(path)) return false;
  Object.assign(target, parseEnv(readFileSync(path, "utf8")));
  return true;
}
