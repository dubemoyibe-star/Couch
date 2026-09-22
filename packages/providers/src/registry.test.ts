import type { MediaWithLicense, PlaybackSource } from "@couch/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ContentProvider, ProviderCapabilities } from "./content-provider";
import { isProviderError } from "./errors";
import { createProviderRegistry } from "./registry";
import { FakeProvider } from "./test/fake-provider";
import { license, mediaWithLicense, mp4Source } from "./test/fixtures";

/** Rejects (or hangs) every call. Simulates a broken or slow provider for isolation tests. */
class BrokenProvider implements ContentProvider {
  readonly id: string;
  readonly displayName = "Broken";
  readonly capabilities: ProviderCapabilities = { search: true, playbackKinds: [] };

  constructor(
    id: string,
    private readonly mode: "throw" | "hang",
    private readonly error: unknown = new Error("boom"),
  ) {
    this.id = id;
  }

  private fail<T>(): Promise<T> {
    if (this.mode === "hang") return new Promise<T>(() => {});
    return Promise.reject(this.error);
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

// Items cast past the FakeProvider's MediaWithLicense-typed constructor, to simulate a
// provider that returns data not matching what its own TS type promises. This is exactly
// what the gate exists to catch, since a provider's declared return type is not a runtime
// guarantee.
const unauthorizedItem = {
  ...mediaWithLicense,
  providerId: "p",
  providerMediaId: "item-unauthorized",
  license: { ...license, intendedUseAllowed: false },
} as MediaWithLicense;

const malformedItem = {
  ...mediaWithLicense,
  providerId: "p",
  providerMediaId: "item-malformed",
  durationSeconds: "not a number",
} as unknown as MediaWithLicense;

describe("createProviderRegistry", () => {
  it("throws when two providers share an id", () => {
    const a = new FakeProvider({ id: "dup" });
    const b = new FakeProvider({ id: "dup" });

    expect(() => createProviderRegistry([a, b])).toThrow(/duplicate provider id "dup"/);
  });

  it("lists registered provider ids and capabilities", () => {
    const a = new FakeProvider({ id: "a", capabilities: { search: true } });
    const b = new FakeProvider({ id: "b", capabilities: { playbackKinds: ["mp4"] } });

    const registry = createProviderRegistry([a, b]);

    expect(registry.providers).toEqual([
      { id: "a", displayName: "Fake Provider", capabilities: { search: true, playbackKinds: [] } },
      { id: "b", displayName: "Fake Provider", capabilities: { search: false, playbackKinds: ["mp4"] } },
    ]);
  });

  describe("listMedia", () => {
    it("drops an unauthorized item and reports it through onRejected", async () => {
      const provider = new FakeProvider({ id: "p", items: [mediaWithLicense, unauthorizedItem] });
      const registry = createProviderRegistry([provider]);
      const onRejected = vi.fn();

      const result = await registry.listMedia({ onRejected });

      expect(result.items).toEqual([mediaWithLicense]);
      expect(result.succeededProviderIds).toEqual(["p"]);
      expect(onRejected).toHaveBeenCalledExactlyOnceWith({
        providerId: "p",
        providerMediaId: "item-unauthorized",
        reason: "unauthorized",
      });
    });

    it("drops a malformed item and reports it through onRejected", async () => {
      const provider = new FakeProvider({ id: "p", items: [mediaWithLicense, malformedItem] });
      const registry = createProviderRegistry([provider]);
      const onRejected = vi.fn();

      const result = await registry.listMedia({ onRejected });

      expect(result.items).toEqual([mediaWithLicense]);
      expect(onRejected).toHaveBeenCalledExactlyOnceWith({
        providerId: "p",
        providerMediaId: "item-malformed",
        reason: "malformed",
      });
    });

    it("isolates one provider's failure from the others", async () => {
      const good = new FakeProvider({ id: "good", items: [mediaWithLicense] });
      const bad = new BrokenProvider("bad", "throw");
      const registry = createProviderRegistry([good, bad]);
      const onProviderError = vi.fn();

      const result = await registry.listMedia({ onProviderError });

      expect(result.items).toEqual([mediaWithLicense]);
      expect(result.succeededProviderIds).toEqual(["good"]);
      expect(onProviderError).toHaveBeenCalledExactlyOnceWith({
        providerId: "bad",
        error: expect.anything(),
      });
    });

    it("isolates one provider's timeout from the others", async () => {
      const good = new FakeProvider({ id: "good", items: [mediaWithLicense] });
      const slow = new BrokenProvider("slow", "hang");
      const registry = createProviderRegistry([good, slow], { timeoutMs: 20 });
      const onProviderError = vi.fn();

      const result = await registry.listMedia({ onProviderError });

      expect(result.items).toEqual([mediaWithLicense]);
      expect(result.succeededProviderIds).toEqual(["good"]);
      expect(onProviderError).toHaveBeenCalledExactlyOnceWith({
        providerId: "slow",
        error: expect.anything(),
      });
      const [[failure]] = onProviderError.mock.calls;
      expect(isProviderError(failure.error)).toBe(true);
      if (isProviderError(failure.error)) {
        expect(failure.error.code).toBe("unavailable");
      }
    });
  });

  describe("searchMedia", () => {
    it("only calls providers whose capabilities.search is true", async () => {
      const searchable = new FakeProvider({
        id: "searchable",
        capabilities: { search: true },
        items: [mediaWithLicense],
      });
      const notSearchable = new FakeProvider({ id: "not-searchable", items: [mediaWithLicense] });
      const searchSpy = vi.spyOn(notSearchable, "search");
      const registry = createProviderRegistry([searchable, notSearchable]);

      const result = await registry.searchMedia("fixture");

      expect(result.items).toEqual([mediaWithLicense]);
      expect(result.succeededProviderIds).toEqual(["searchable"]);
      expect(searchSpy).not.toHaveBeenCalled();
    });
  });

  describe("getMedia", () => {
    it("returns the gated item for a known ref", async () => {
      const provider = new FakeProvider({ id: "p", items: [mediaWithLicense] });
      const registry = createProviderRegistry([provider]);

      await expect(
        registry.getMedia({ providerId: "p", providerMediaId: mediaWithLicense.providerMediaId }),
      ).resolves.toEqual(mediaWithLicense);
    });

    it("throws ProviderError with code license_rejected for an unauthorized item", async () => {
      const provider = new FakeProvider({ id: "p", items: [unauthorizedItem] });
      const registry = createProviderRegistry([provider]);

      const error = await registry
        .getMedia({ providerId: "p", providerMediaId: "item-unauthorized" })
        .catch((e: unknown) => e);

      expect(isProviderError(error)).toBe(true);
      if (isProviderError(error)) {
        expect(error.code).toBe("license_rejected");
        expect(error.providerId).toBe("p");
      }
    });

    it("throws ProviderError with code not_found for an unregistered provider id", async () => {
      const registry = createProviderRegistry([]);

      const error = await registry
        .getMedia({ providerId: "missing", providerMediaId: "x" })
        .catch((e: unknown) => e);

      expect(isProviderError(error)).toBe(true);
      if (isProviderError(error)) expect(error.code).toBe("not_found");
    });
  });

  describe("getPlayback", () => {
    it("returns a playback source for an authorized item", async () => {
      const provider = new FakeProvider({
        id: "p",
        capabilities: { playbackKinds: ["mp4"] },
        items: [mediaWithLicense],
        playback: { [mediaWithLicense.providerMediaId]: mp4Source },
      });
      const registry = createProviderRegistry([provider]);

      await expect(
        registry.getPlayback({ providerId: "p", providerMediaId: mediaWithLicense.providerMediaId }),
      ).resolves.toEqual(mp4Source);
    });

    it("refuses playback for unauthorized media without ever calling the provider's getPlayback", async () => {
      const provider = new FakeProvider({
        id: "p",
        capabilities: { playbackKinds: ["mp4"] },
        items: [unauthorizedItem],
        playback: { "item-unauthorized": mp4Source },
      });
      const playbackSpy = vi.spyOn(provider, "getPlayback");
      const registry = createProviderRegistry([provider]);

      const error = await registry
        .getPlayback({ providerId: "p", providerMediaId: "item-unauthorized" })
        .catch((e: unknown) => e);

      expect(isProviderError(error)).toBe(true);
      if (isProviderError(error)) expect(error.code).toBe("license_rejected");
      expect(playbackSpy).not.toHaveBeenCalled();
    });
  });
});
