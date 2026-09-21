import { fileURLToPath } from "node:url";
import { createPrismaConfig } from "./src/prisma-config";

// Test environment: variables come from .env.test at the repo root. Select it
// with `--config prisma.test.config.ts` (see the db:*:test scripts).
export default createPrismaConfig(
  fileURLToPath(new URL("../../.env.test", import.meta.url)),
);
