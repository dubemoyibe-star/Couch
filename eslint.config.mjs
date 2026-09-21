// Lint config for apps/realtime and packages/*. apps/web keeps its own
// config (Next's core-web-vitals rules); ESLint uses the nearest config file.
import { defineConfig, globalIgnores } from "eslint/config";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextTs,
  globalIgnores(["**/dist/**", "**/coverage/**"]),
]);
