import { defineConfig } from "vitest/config";

// Vitest does not copy dotenv files into process.env, so the setup file loads
// .env.test. Suites that touch the database still have to call
// assertDatabaseEnv(process.env, "test-suite") themselves.
export default defineConfig({
  test: {
    setupFiles: ["./src/vitest-setup.ts"],
    // Database suites talk to Neon over the network, and the first connection
    // can wait for the compute to wake, so the 5s default is too short.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
