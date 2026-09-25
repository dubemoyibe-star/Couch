import { defineConfig } from "vitest/config";

// `pnpm test:db`: only the *.db.test.ts files. The global setup loads
// .env.test and runs the COUCH_DB_ENV guard before anything else, and fails the
// run when it does not pass. There is no --passWithNoTests here, so an empty
// match fails instead of passing silently.
export default defineConfig({
  test: {
    include: ["**/*.db.test.ts"],
    globalSetup: ["./src/vitest-db-setup.ts"],
    fileParallelism: false,
    // The first connection to Neon can wait for the compute to wake.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
