import { fileURLToPath } from "node:url";
import {
  assertDatabaseEnv,
  countMissing,
  createPrismaClient,
  DatabaseGuardError,
  deactivateMissing,
  loadEnvFile,
  upsertCatalogMedia,
} from "@couch/database";
import { createProviderRegistry, StaticProvider } from "@couch/providers";
import { runSync, syncSucceeded, type SyncResult } from "./sync-catalog-core";

// Syncs the gated provider registry into the database catalog. apps/web is the composition
// root: this is the only place that imports both @couch/providers and @couch/database, so
// packages/database keeps not depending on packages/providers (see docs/ARCHITECTURE.md).
//
// Database safety: this script always runs `assertDatabaseEnv(process.env, "destructive")`
// before touching the database, the same guard `db:reset` and `db:migrate` use. It refuses
// to run when COUCH_DB_ENV is prod (only "dev" and "test" are allowed for a "destructive"
// purpose) or when DATABASE_URL/DIRECT_URL do not agree with COUCH_DB_ENV. There is no flag
// or environment variable that skips it, on purpose: that is how a production database is
// kept out of reach of a developer machine.

const DEFAULT_CATALOG_DIR = fileURLToPath(new URL("../../../packages/providers/catalog", import.meta.url));
const DEFAULT_ENV_FILE = fileURLToPath(new URL("../../../.env.local", import.meta.url));

type Flags = {
  readonly dryRun: boolean;
  readonly catalogDir: string;
  readonly envFile: string;
};

function parseFlags(argv: readonly string[]): Flags {
  let dryRun = false;
  let catalogDir = DEFAULT_CATALOG_DIR;
  let envFile = DEFAULT_ENV_FILE;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--catalog-dir") {
      const value = argv[++i];
      if (!value) throw new Error("--catalog-dir requires a path");
      catalogDir = value;
    } else if (arg === "--env-file") {
      const value = argv[++i];
      if (!value) throw new Error("--env-file requires a path");
      envFile = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { dryRun, catalogDir, envFile };
}

function printSummary(result: SyncResult): void {
  const kept = result.upserted.filter((item) => item.kept);
  const totalDeactivated = result.deactivations.reduce((sum, entry) => sum + entry.count, 0);
  const verb = result.dryRun ? "Would upsert" : "Upserted";
  const deactivateVerb = result.dryRun ? "Would deactivate" : "Deactivated";

  console.log(`${verb}: ${kept.length}`);
  if (!result.dryRun && kept.length !== result.upserted.length) {
    const notKept = result.upserted.length - kept.length;
    console.log(`  (${notKept} upsert(s) stored a row that is not authorized; not counted as kept)`);
  }
  console.log(`${deactivateVerb}: ${totalDeactivated}`);
  for (const entry of result.deactivations) {
    console.log(`  ${entry.providerId}: ${entry.count}`);
  }

  console.log(`Rejected: ${result.rejected.length}`);
  for (const rejection of result.rejected) {
    console.log(`  ${rejection.providerId}/${rejection.providerMediaId}: ${rejection.reason}`);
  }

  console.log(`Providers failed: ${result.providerFailures.length}`);
  for (const failure of result.providerFailures) {
    const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
    console.log(`  ${failure.providerId}: ${message}`);
  }

  if (result.databaseFailures.length > 0) {
    console.log(`Database failures: ${result.databaseFailures.length}`);
    for (const failure of result.databaseFailures) {
      const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
      const target = failure.providerMediaId
        ? `${failure.providerId}/${failure.providerMediaId}`
        : failure.providerId;
      console.log(`  [${failure.stage}] ${target}: ${message}`);
    }
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  loadEnvFile(flags.envFile);

  try {
    assertDatabaseEnv(
      {
        COUCH_DB_ENV: process.env.COUCH_DB_ENV,
        DATABASE_URL: process.env.DATABASE_URL,
        DIRECT_URL: process.env.DIRECT_URL,
      },
      "destructive",
    );
  } catch (error) {
    if (error instanceof DatabaseGuardError) {
      console.error(`Refusing to run: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const db = createPrismaClient({ connectionString });

  try {
    const provider = new StaticProvider({ catalogDir: flags.catalogDir });
    const registry = createProviderRegistry([provider]);

    const result = await runSync(
      {
        listMedia: ({ onRejected, onProviderError }) => registry.listMedia({ onRejected, onProviderError }),
        upsertMedia: (media) => upsertCatalogMedia(db, media),
        deactivateMissing: (providerId, keep) => deactivateMissing(db, providerId, keep),
        countWouldDeactivate: (providerId, keep) => countMissing(db, providerId, keep),
      },
      { dryRun: flags.dryRun },
    );

    printSummary(result);
    process.exitCode = syncSucceeded(result) ? 0 : 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
