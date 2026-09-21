import { defineConfig } from "prisma/config";
import { assertDatabaseEnv } from "./env-guard";
import { loadEnvFile } from "./env-files";
import { classifyPrismaCommand } from "./prisma-command";

// Shared by prisma.config.ts (dev, .env.local) and prisma.config.test.ts
// (test, .env.test). The Prisma CLI does not read dotenv files on its own, so
// the chosen file is loaded here, then the guard runs for every command that
// can reach a database, including a `prisma` command typed by hand. The CLI
// always uses DIRECT_URL: migrations must not go through the pooler.
export function createPrismaConfig(envFilePath: string) {
  loadEnvFile(envFilePath);

  const purpose = classifyPrismaCommand(process.argv);
  if (purpose !== null) {
    try {
      assertDatabaseEnv(process.env, purpose);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "guard failed";
      console.error(`Refusing to run: ${reason}`);
      process.exit(1);
    }
  }

  return defineConfig({
    schema: "prisma/schema.prisma",
    migrations: { path: "prisma/migrations" },
    datasource: { url: process.env.DIRECT_URL ?? "" },
  });
}
