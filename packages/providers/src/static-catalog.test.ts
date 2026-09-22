import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createProviderRegistry } from "./registry";
import { StaticProvider } from "./static-catalog";

/** Absolute path to a fixture directory under `src/test/static-fixtures`. */
function fixtureDir(name: string): string {
  return fileURLToPath(new URL(`./test/static-fixtures/${name}/`, import.meta.url));
}

describe("StaticProvider", () => {
  describe("loading", () => {
    it("loads valid fixtures, including an intendedUseAllowed: false entry", () => {
      const provider = new StaticProvider({ catalogDir: fixtureDir("valid") });

      expect(provider.id).toBe("static");
      expect(provider.capabilities).toEqual({ search: true, playbackKinds: ["mp4", "hls"] });
    });

    it("rejects a duplicate providerMediaId, naming the file and entry", () => {
      expect(() => new StaticProvider({ catalogDir: fixtureDir("duplicate") })).toThrow(
        /manifest\.json" entry 1 has duplicate providerMediaId "fixture-dup"/,
      );
    });

    it("rejects a schema-invalid entry, naming the file and entry", () => {
      expect(() => new StaticProvider({ catalogDir: fixtureDir("malformed") })).toThrow(
        /manifest\.json" entry 0 failed validation/,
      );
    });

    it("rejects a file that is not valid JSON, naming the file", () => {
      expect(() => new StaticProvider({ catalogDir: fixtureDir("bad-json") })).toThrow(
        /manifest\.json" is not valid JSON/,
      );
    });

    it("rejects an entry whose providerId does not match the provider's own id", () => {
      expect(() => new StaticProvider({ catalogDir: fixtureDir("wrong-provider-id") })).toThrow(
        /entry 0 has providerId "some-other-provider", expected "static"/,
      );
    });

    it("rejects a missing catalog directory, naming the directory", () => {
      const missingDir = fixtureDir("does-not-exist");

      expect(() => new StaticProvider({ catalogDir: missingDir })).toThrow(
        /catalog directory ".*does-not-exist.*" could not be read/,
      );
    });
  });

  describe("list", () => {
    it("returns every loaded item as MediaWithLicense, without the playback field", async () => {
      const provider = new StaticProvider({ catalogDir: fixtureDir("valid") });

      const items = await provider.list();

      expect(items).toHaveLength(2);
      expect(items.map((item) => item.providerMediaId).sort()).toEqual([
        "fixture-alpha",
        "fixture-beta-unauthorized",
      ]);
      for (const item of items) expect(item).not.toHaveProperty("playback");
    });
  });

  describe("search", () => {
    it("matches titles case-insensitively", async () => {
      const provider = new StaticProvider({ catalogDir: fixtureDir("valid") });

      await expect(provider.search("alpha")).resolves.toMatchObject([
        { providerMediaId: "fixture-alpha" },
      ]);
      await expect(provider.search("ALPHA")).resolves.toMatchObject([
        { providerMediaId: "fixture-alpha" },
      ]);
      await expect(provider.search("no-such-title")).resolves.toEqual([]);
    });
  });

  describe("getDetails", () => {
    it("returns the item for a known id", async () => {
      const provider = new StaticProvider({ catalogDir: fixtureDir("valid") });

      await expect(provider.getDetails("fixture-alpha")).resolves.toMatchObject({
        providerMediaId: "fixture-alpha",
        title: "TEST FIXTURE Alpha",
      });
    });

    it("throws ProviderError with code not_found for an unknown id", async () => {
      const provider = new StaticProvider({ catalogDir: fixtureDir("valid") });

      const error = await provider.getDetails("missing").catch((e: unknown) => e);
      expect(error).toMatchObject({ name: "ProviderError", code: "not_found", providerId: "static" });
    });
  });

  describe("getPlayback", () => {
    it("returns the playback source for a known id", async () => {
      const provider = new StaticProvider({ catalogDir: fixtureDir("valid") });

      await expect(provider.getPlayback("fixture-alpha")).resolves.toEqual({
        kind: "mp4",
        url: "https://example.com/alpha.mp4",
      });
    });

    it("throws ProviderError with code not_found for an unknown id", async () => {
      const provider = new StaticProvider({ catalogDir: fixtureDir("valid") });

      const error = await provider.getPlayback("missing").catch((e: unknown) => e);
      expect(error).toMatchObject({ name: "ProviderError", code: "not_found", providerId: "static" });
    });
  });

  describe("options.signal", () => {
    it("rejects every method when the signal is already aborted", async () => {
      const provider = new StaticProvider({ catalogDir: fixtureDir("valid") });
      const controller = new AbortController();
      controller.abort(new Error("cancelled"));

      await expect(provider.list({ signal: controller.signal })).rejects.toThrow("cancelled");
      await expect(provider.search("alpha", { signal: controller.signal })).rejects.toThrow("cancelled");
      await expect(
        provider.getDetails("fixture-alpha", { signal: controller.signal }),
      ).rejects.toThrow("cancelled");
      await expect(
        provider.getPlayback("fixture-alpha", { signal: controller.signal }),
      ).rejects.toThrow("cancelled");
    });
  });

  describe("composed inside the gated registry", () => {
    it("passes an authorized item through and drops an intendedUseAllowed: false item", async () => {
      const provider = new StaticProvider({ catalogDir: fixtureDir("registry-integration") });
      const registry = createProviderRegistry([provider]);

      const result = await registry.listMedia();

      expect(result.succeededProviderIds).toEqual(["static"]);
      expect(result.items.map((item) => item.providerMediaId)).toEqual(["fixture-authorized"]);
    });
  });
});
