import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env-files";

loadEnvFile(fileURLToPath(new URL("../../../.env.test", import.meta.url)));
