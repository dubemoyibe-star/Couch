import { describe, expect, it } from "vitest";
import * as database from "./index";

describe("public exports", () => {
  // Adding an export means adding it here on purpose. The catalog rule is that no
  // exported function returns unauthorized, malformed or inactive media, and none
  // deletes media, so a new read or delete has to be a visible change.
  it("lists exactly the intended runtime exports", () => {
    expect(Object.keys(database).sort()).toEqual(
      [
        "DEFAULT_CONNECTION_TIMEOUT_MS",
        "DatabaseGuardError",
        "MAX_CATALOG_PAGE_SIZE",
        "PrismaClient",
        "assertDatabaseEnv",
        "checkDatabaseEnv",
        "createPrismaClient",
        "deactivateMissing",
        "getCatalogMedia",
        "getPrismaClient",
        "listCatalogMedia",
        "upsertCatalogMedia",
      ].sort(),
    );
  });

  it("has no unfiltered read and no delete for media", () => {
    const names = Object.keys(database);
    expect(names.filter((name) => /delete|remove|destroy|purge|truncate/i.test(name))).toEqual([]);
    // The only catalog reads are the two gated ones.
    expect(names.filter((name) => /^(find|get|list|read|fetch)/i.test(name)).sort()).toEqual([
      "getCatalogMedia",
      "getPrismaClient",
      "listCatalogMedia",
    ]);
  });

  it("does not export the row mapping or the test helpers", () => {
    const names = Object.keys(database);
    for (const name of [
      "toCatalogCandidate",
      "validateRow",
      "cleanupTestMedia",
      "fixtureMedia",
      "newRunPrefix",
    ]) {
      expect(names).not.toContain(name);
    }
  });
});
