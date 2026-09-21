import { fileURLToPath } from "node:url";
import { createPrismaConfig } from "./src/prisma-config";

// Dev environment: variables come from .env.local at the repo root.
export default createPrismaConfig(
  fileURLToPath(new URL("../../.env.local", import.meta.url)),
);
