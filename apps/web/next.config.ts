import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// Next.js reads .env files from this app's directory only. The database
// variables live in .env.local at the repo root, so load that file for
// `next dev`. Production builds and servers get their variables from the
// hosting provider and never read a local file.
if (process.env.NODE_ENV === "development") {
  const rootEnvFile = resolve(process.cwd(), "../../.env.local");
  if (existsSync(rootEnvFile)) {
    Object.assign(process.env, parseEnv(readFileSync(rootEnvFile, "utf8")));
  }
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
