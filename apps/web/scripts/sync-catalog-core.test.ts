import type { CatalogMedia, MediaWithLicense, PlaybackSource } from "@couch/contracts";
import { createProviderRegistry, type ContentProvider, type ProviderCapabilities } from "@couch/providers";
import { describe, expect, it, vi } from "vitest";
import { runSync, syncSucceeded, type SyncDeps } from "./sync-catalog-core";

// Every fixture below is obviously fake: titles start with "TEST FIXTURE" and hosts are
// example.com/example.invalid, matching the convention in packages/providers and
// packages/database's own test fixtures.

const license: MediaWithLicense["license"] = {
  licenseName: "TEST FIXTURE License",
  licenseVersion: "1.0",
  licenseUrl: "https://example.invalid/license",
  sourceUrl: "https://example.invalid/items/1",
  rightsholder: "TEST FIXTURE Rightsholder",
  attributionRequired: false,
  attribution: null,
  intendedUseAllowed: true,
  commercialUseAllowed: false,
  additionalRestrictions: null,
  verifiedAt: "2026-02-03",
  verificationNotes: null,
};

function media(providerId: string, providerMediaId: string, overrides: Partial<MediaWithLicense> = {}): MediaWithLicense {
  return {
    providerId,
    providerMediaId,
    title: `TEST FIXTURE ${providerMediaId}`,
    description: "TEST FIXTURE description",
    durationSeconds: 3600,
    posterUrl: "https://example.com/poster.png",
    releaseYear: 2020,
    license,
    ...overrides,
  };
}

function catalogMedia(item: MediaWithLicense): CatalogMedia {
  return { id: `id-${item.providerMediaId}`, ...item };
}

/** A minimal in-memory ContentProvider, local to this test file (not exported from any package). */
class TestProvider implements ContentProvider {
  readonly id: string;
  readonly displayName = "Test Provider";
  readonly capabilities: ProviderCapabilities = { search: false, playbackKinds: [] };

  constructor(
    id: string,
    private readonly items: readonly MediaWithLicense[],
  ) {
    this.id = id;
  }

  async list(): Promise<MediaWithLicense[]> {
    return [...this.items];
  }
  async search(): Promise<MediaWithLicense[]> {
    return [];
  }
  async getDetails(): Promise<MediaWithLicense> {
    throw new Error("not used in this test");
  }
  async getPlayback(): Promise<PlaybackSource> {
    throw new Error("not used in this test");
  }
}

/** Throws (or hangs forever) on every call. Simulates a broken or slow provider. */
class BrokenProvider implements ContentProvider {
  readonly displayName = "Broken";
  readonly capabilities: ProviderCapabilities = { search: false, playbackKinds: [] };

  constructor(
    readonly id: string,
    private readonly mode: "throw" | "hang",
  ) {}

  private fail<T>(): Promise<T> {
    if (this.mode === "hang") return new Promise<T>(() => {});
    return Promise.reject(new Error(`${this.id} boom`));
  }

  list(): Promise<MediaWithLicense[]> {
    return this.fail();
  }
  search(): Promise<MediaWithLicense[]> {
    return this.fail();
  }
  getDetails(): Promise<MediaWithLicense> {
    return this.fail();
  }
  getPlayback(): Promise<PlaybackSource> {
    return this.fail();
  }
}

/** Builds SyncDeps from a real @couch/providers registry plus fake, in-memory DB functions. */
function depsFromRegistry(
  registry: ReturnType<typeof createProviderRegistry>,
  overrides: Partial<SyncDeps> = {},
): SyncDeps {
  return {
    listMedia: (handlers) => registry.listMedia(handlers),
    upsertMedia: vi.fn(async (item: MediaWithLicense) => catalogMedia(item)),
    deactivateMissing: vi.fn(async () => 0),
    countWouldDeactivate: vi.fn(async () => 0),
    ...overrides,
  };
}

describe("runSync", () => {
  it("upserts every gated item and deactivates using only the providerMediaIds that were kept", async () => {
    const itemA = media("p", "a");
    const itemB = media("p", "b");
    const registry = createProviderRegistry([new TestProvider("p", [itemA, itemB])]);
    const deactivateMissing = vi.fn(async () => 1);
    const deps = depsFromRegistry(registry, { deactivateMissing });

    const result = await runSync(deps, { dryRun: false });

    expect(result.upserted).toEqual([
      { providerId: "p", providerMediaId: "a", title: itemA.title, kept: true },
      { providerId: "p", providerMediaId: "b", title: itemB.title, kept: true },
    ]);
    expect(deactivateMissing).toHaveBeenCalledExactlyOnceWith("p", ["a", "b"]);
    expect(result.deactivations).toEqual([{ providerId: "p", count: 1 }]);
    expect(syncSucceeded(result)).toBe(true);
  });

  it("Issue 8: an upsert that returns null (revoked license) is not treated as kept", async () => {
    const kept = media("p", "kept");
    const revoked = media("p", "revoked");
    const registry = createProviderRegistry([new TestProvider("p", [kept, revoked])]);
    const upsertMedia = vi.fn(async (item: MediaWithLicense) =>
      item.providerMediaId === "revoked" ? null : catalogMedia(item),
    );
    const deactivateMissing = vi.fn(async () => 1);
    const deps = depsFromRegistry(registry, { upsertMedia, deactivateMissing });

    const result = await runSync(deps, { dryRun: false });

    expect(result.upserted).toEqual([
      { providerId: "p", providerMediaId: "kept", title: kept.title, kept: true },
      { providerId: "p", providerMediaId: "revoked", title: revoked.title, kept: false },
    ]);
    // Only "kept" is passed as the keep list. "revoked" was upserted (its row exists,
    // isActive stays whatever the write left it), but it is not in the keep list, so a
    // stale "revoked" row from an earlier run would be deactivated by this same call.
    expect(deactivateMissing).toHaveBeenCalledExactlyOnceWith("p", ["kept"]);
    expect(syncSucceeded(result)).toBe(true);
  });

  it("an upsert that throws is not treated as kept and is reported as a database failure", async () => {
    const ok = media("p", "ok");
    const broken = media("p", "broken");
    const registry = createProviderRegistry([new TestProvider("p", [ok, broken])]);
    const upsertMedia = vi.fn(async (item: MediaWithLicense) => {
      if (item.providerMediaId === "broken") throw new Error("write failed");
      return catalogMedia(item);
    });
    const deactivateMissing = vi.fn(async () => 0);
    const deps = depsFromRegistry(registry, { upsertMedia, deactivateMissing });

    const result = await runSync(deps, { dryRun: false });

    expect(deactivateMissing).toHaveBeenCalledExactlyOnceWith("p", ["ok"]);
    expect(result.databaseFailures).toEqual([
      { providerId: "p", providerMediaId: "broken", stage: "upsert", error: expect.any(Error) },
    ]);
    expect(syncSucceeded(result)).toBe(false);
  });

  it("SAFETY: a provider that fails never has deactivateMissing called for it", async () => {
    const good = media("good", "a");
    const registry = createProviderRegistry([
      new TestProvider("good", [good]),
      new BrokenProvider("bad", "throw"),
    ]);
    const deactivateMissing = vi.fn(async () => 0);
    const deps = depsFromRegistry(registry, { deactivateMissing });

    const result = await runSync(deps, { dryRun: false });

    expect(deactivateMissing).toHaveBeenCalledExactlyOnceWith("good", ["a"]);
    expect(deactivateMissing).not.toHaveBeenCalledWith("bad", expect.anything());
    expect(result.providerFailures).toEqual([{ providerId: "bad", error: expect.any(Error) }]);
    expect(syncSucceeded(result)).toBe(false);
  });

  it("SAFETY: a provider that times out never has deactivateMissing called for it", async () => {
    const good = media("good", "a");
    const registry = createProviderRegistry(
      [new TestProvider("good", [good]), new BrokenProvider("slow", "hang")],
      { timeoutMs: 20 },
    );
    const deactivateMissing = vi.fn(async () => 0);
    const deps = depsFromRegistry(registry, { deactivateMissing });

    const result = await runSync(deps, { dryRun: false });

    expect(deactivateMissing).toHaveBeenCalledExactlyOnceWith("good", ["a"]);
    expect(result.providerFailures).toEqual([{ providerId: "slow", error: expect.any(Error) }]);
    expect(syncSucceeded(result)).toBe(false);
  });

  it("reports a rejected (unauthorized or malformed) candidate without upserting it", async () => {
    const unauthorized = media("p", "unauthorized", { license: { ...license, intendedUseAllowed: false } });
    const registry = createProviderRegistry([new TestProvider("p", [unauthorized])]);
    const upsertMedia = vi.fn(async () => catalogMedia(unauthorized));
    const deps = depsFromRegistry(registry, { upsertMedia });

    const result = await runSync(deps, { dryRun: false });

    expect(upsertMedia).not.toHaveBeenCalled();
    expect(result.rejected).toEqual([{ providerId: "p", providerMediaId: "unauthorized", reason: "unauthorized" }]);
  });

  it("--dry-run never calls upsertMedia or deactivateMissing, only the read-only count", async () => {
    const itemA = media("p", "a");
    const registry = createProviderRegistry([new TestProvider("p", [itemA])]);
    const upsertMedia = vi.fn(async () => catalogMedia(itemA));
    const deactivateMissing = vi.fn(async () => 0);
    const countWouldDeactivate = vi.fn(async () => 3);
    const deps = depsFromRegistry(registry, { upsertMedia, deactivateMissing, countWouldDeactivate });

    const result = await runSync(deps, { dryRun: true });

    expect(upsertMedia).not.toHaveBeenCalled();
    expect(deactivateMissing).not.toHaveBeenCalled();
    expect(countWouldDeactivate).toHaveBeenCalledExactlyOnceWith("p", ["a"]);
    expect(result.upserted).toEqual([{ providerId: "p", providerMediaId: "a", title: itemA.title, kept: true }]);
    expect(result.deactivations).toEqual([{ providerId: "p", count: 3 }]);
  });

  it("calls deactivateMissing with an empty keep list when a succeeded provider returns nothing", async () => {
    const registry = createProviderRegistry([new TestProvider("p", [])]);
    const deactivateMissing = vi.fn(async () => 2);
    const deps = depsFromRegistry(registry, { deactivateMissing });

    await runSync(deps, { dryRun: false });

    expect(deactivateMissing).toHaveBeenCalledExactlyOnceWith("p", []);
  });
});
