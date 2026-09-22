#!/usr/bin/env node
// Runs `prisma migrate dev`, forwarding every CLI argument (for example
// `--name couch_and_membership`) to it, then always runs `prisma generate`
// afterwards. In Prisma 7, `migrate dev` does not regenerate the client on its
// own, so a migration created this way never leaves a stale client.
//
// This is a plain wrapper script rather than `prisma migrate dev && prisma
// generate` in package.json because pnpm's `-- <args>` forwarding appends
// extra arguments to the END of a chained script string, which would attach
// `--name` to `prisma generate` instead of `prisma migrate dev`.
import { spawnSync } from "node:child_process";

function run(command, args) {
  // shell: true is needed on Windows to resolve the .cmd shim in
  // node_modules/.bin. Node warns (DEP0190) that shell + an args array does
  // not escape the arguments; the only argument ever passed through here is
  // --name <migration name>, typed by the person running the script, so this
  // is accepted rather than built around.
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("prisma", ["migrate", "dev", ...process.argv.slice(2)]);
run("prisma", ["generate"]);
