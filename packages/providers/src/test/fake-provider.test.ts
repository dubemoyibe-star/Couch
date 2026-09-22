import { describe, expect, it } from "vitest";
import type { ContentProvider } from "../content-provider";
import { isProviderError } from "../errors";
import { FakeProvider } from "./fake-provider";
import { mediaWithLicense, mp4Source } from "./fixtures";

describe("FakeProvider", () => {
  it("implements ContentProvider without casts", () => {
    const provider: ContentProvider = new FakeProvider();
    expect(provider.id).toBe("fake");
  });

  it("lists items regardless of declared capabilities", async () => {
    const provider = new FakeProvider({ items: [mediaWithLicense] });

    await expect(provider.list()).resolves.toEqual([mediaWithLicense]);
  });

  it("returns matching items from search when search is supported", async () => {
    const provider = new FakeProvider({
      capabilities: { search: true },
      items: [mediaWithLicense],
    });

    await expect(provider.search("fixture")).resolves.toEqual([mediaWithLicense]);
    await expect(provider.search("no match")).resolves.toEqual([]);
  });

  it("throws a ProviderError with code unsupported when search is not declared", async () => {
    const provider = new FakeProvider({ items: [mediaWithLicense] });

    const error = await provider.search("fixture").catch((e: unknown) => e);
    expect(isProviderError(error)).toBe(true);
    if (isProviderError(error)) {
      expect(error.code).toBe("unsupported");
      expect(error.providerId).toBe("fake");
    }
  });

  it("returns full details for a known item", async () => {
    const provider = new FakeProvider({ items: [mediaWithLicense] });

    await expect(provider.getDetails(mediaWithLicense.providerMediaId)).resolves.toEqual(
      mediaWithLicense,
    );
  });

  it("throws a ProviderError with code not_found for an unknown item", async () => {
    const provider = new FakeProvider({ items: [mediaWithLicense] });

    const error = await provider.getDetails("missing").catch((e: unknown) => e);
    expect(isProviderError(error)).toBe(true);
    if (isProviderError(error)) {
      expect(error.code).toBe("not_found");
    }
  });

  it("returns a playback source for a declared kind", async () => {
    const provider = new FakeProvider({
      capabilities: { playbackKinds: ["mp4"] },
      items: [mediaWithLicense],
      playback: { [mediaWithLicense.providerMediaId]: mp4Source },
    });

    await expect(provider.getPlayback(mediaWithLicense.providerMediaId)).resolves.toEqual(
      mp4Source,
    );
  });

  it("throws a ProviderError with code unsupported for a kind outside capabilities", async () => {
    const provider = new FakeProvider({
      capabilities: { playbackKinds: [] },
      items: [mediaWithLicense],
      playback: { [mediaWithLicense.providerMediaId]: mp4Source },
    });

    const error = await provider.getPlayback(mediaWithLicense.providerMediaId).catch((e: unknown) => e);
    expect(isProviderError(error)).toBe(true);
    if (isProviderError(error)) {
      expect(error.code).toBe("unsupported");
    }
  });

  it("throws a ProviderError with code not_found for playback on an unknown item", async () => {
    const provider = new FakeProvider();

    const error = await provider.getPlayback("missing").catch((e: unknown) => e);
    expect(isProviderError(error)).toBe(true);
    if (isProviderError(error)) {
      expect(error.code).toBe("not_found");
    }
  });
});
