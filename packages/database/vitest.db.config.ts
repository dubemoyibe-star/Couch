import { defineConfig } from "vitest/config";

// `pnpm test:db`: only the *.db.test.ts files. The global setup loads
// .env.test and runs the COUCH_DB_ENV guard before anything else, and fails the
// run when it does not pass. There is no --passWithNoTests here, so an empty
// match fails instead of passing silently.
export default defineConfig({
  test: {
    include: ["**/*.db.test.ts"],
    globalSetup: ["./src/vitest-db-setup.ts"],
    // Files share one database, so they run one at a time.
    fileParallelism: false,
    // Database suites talk to Neon over the network, and the first connection
    // can wait for the compute to wake, so the 5s default is too short.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
