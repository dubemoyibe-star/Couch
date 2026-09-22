import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the `@/*` -> `./src/*` alias from tsconfig.json, which Next.js
// resolves on its own but Vitest does not without this. Needed so a test can
// import a file (for example a Server Action) that uses the alias.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
