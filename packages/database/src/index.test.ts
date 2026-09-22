import { describe, expect, it } from "vitest";
import * as database from "./index";

describe("public exports", () => {
  // Adding an export means adding it here on purpose. The catalog rule is that no
  // exported function returns unauthorized, malformed or inactive media, and none
  // deletes media, so a new read or delete has to be a visible change. The same goes
  // for couches and users: there is no delete function for any of the three.
  it("lists exactly the intended runtime exports", () => {
    expect(Object.keys(database).sort()).toEqual(
      [
        "DEFAULT_CONNECTION_TIMEOUT_MS",
        "DatabaseGuardError",
        "INVITE_CODE_ALPHABET",
        "INVITE_CODE_BITS",
        "INVITE_CODE_LENGTH",
        "MAX_CATALOG_PAGE_SIZE",
        "MAX_INVITE_CODE_ATTEMPTS",
        "PrismaClient",
        "assertDatabaseEnv",
        "checkDatabaseEnv",
        "createCouch",
        "createPrismaClient",
        "deactivateMissing",
        "generateInviteCode",
        "getCatalogMedia",
        "getCouch",
        "getCouchByInviteCode",
        "getMembership",
        "getPrismaClient",
        "joinCouch",
        "leaveCouch",
        "listCatalogMedia",
        "loadEnvFile",
        "listMembers",
        "removeMember",
        "setCurrentMedia",
        "toContractRole",
        "toDbRole",
        "upsertCatalogMedia",
      ].sort(),
    );
  });

  it("has no unfiltered read and no delete for media, couches or users", () => {
    const names = Object.keys(database);
    // `removeMember` removes a couch MEMBERSHIP, which is documented and expected:
    // it deletes neither a user, a couch nor a media row. It is named explicitly
    // here so this check still catches an actual delete function under any of the
    // usual names, present or future.
    const nonDeleteExceptions = new Set(["removeMember"]);
    const deleteLike = names.filter((name) => /delete|remove|destroy|purge|truncate/i.test(name));
    expect(deleteLike.filter((name) => !nonDeleteExceptions.has(name))).toEqual([]);
    // The only catalog reads are the two gated ones.
    expect(names.filter((name) => /^(find|get|list|read|fetch)/i.test(name)).sort()).toEqual(
      [
        "getCatalogMedia",
        "getCouch",
        "getCouchByInviteCode",
        "getMembership",
        "getPrismaClient",
        "listCatalogMedia",
        "listMembers",
      ].sort(),
    );
  });

  it("does not export the row mapping or the test helpers", () => {
    const names = Object.keys(database);
    for (const name of [
      "toCatalogCandidate",
      "validateRow",
      "cleanupTestMedia",
      "fixtureMedia",
      "newRunPrefix",
      "toCouch",
      "toMembership",
      "withInviteCodeRetry",
      "createTestUser",
      "cleanupTestCouches",
    ]) {
      expect(names).not.toContain(name);
    }
  });
});
