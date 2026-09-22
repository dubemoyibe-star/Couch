import { defineConfig } from "vitest/config";

// Unit tests for the pure functions behind the repo guard scripts
// (scripts/check-no-media.mjs, scripts/check-no-direct-media-access.mjs).
// These live at the repo root, not inside a package under apps/* or
// packages/*, so they run through this separate config rather than
// `pnpm -r test`. Wired into the root `test` script.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.mjs"],
  },
});
