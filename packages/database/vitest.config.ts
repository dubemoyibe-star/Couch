import { configDefaults, defineConfig } from "vitest/config";

// `pnpm test`: unit tests only. Files named *.db.test.ts touch a database and
// run through vitest.db.config.ts (`pnpm test:db`) instead. No env file is
// loaded, so this passes on a fresh clone with no database.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/*.db.test.ts"],
  },
});
