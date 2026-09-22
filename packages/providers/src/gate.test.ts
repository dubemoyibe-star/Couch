import { describe, expect, it } from "vitest";
import { gateMedia } from "./gate";
import { license, mediaWithLicense } from "./test/fixtures";

describe("gateMedia", () => {
  it("accepts a well-formed, authorized item", () => {
    const result = gateMedia(mediaWithLicense, "fake");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.media).toEqual(mediaWithLicense);
  });

  it("rejects with reason unauthorized when intendedUseAllowed is false", () => {
    const candidate = {
      ...mediaWithLicense,
      license: { ...license, intendedUseAllowed: false },
    };

    const result = gateMedia(candidate, "fake");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection).toEqual({
        providerId: "fake",
        providerMediaId: "item-1",
        reason: "unauthorized",
      });
    }
  });

  it("rejects with reason malformed when attribution is required but missing", () => {
    const candidate = {
      ...mediaWithLicense,
      license: { ...license, attributionRequired: true, attribution: null },
    };

    const result = gateMedia(candidate, "fake");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe("malformed");
  });

  it("rejects with reason malformed for a candidate with no license field", () => {
    const withoutLicense: Record<string, unknown> = { ...mediaWithLicense };
    delete withoutLicense.license;

    const result = gateMedia(withoutLicense, "fake");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection).toEqual({
        providerId: "fake",
        providerMediaId: "item-1",
        reason: "malformed",
      });
    }
  });

  it("rejects with reason malformed for a candidate with the wrong field types", () => {
    const candidate = { ...mediaWithLicense, durationSeconds: "not a number" };

    const result = gateMedia(candidate, "fake");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejection.reason).toBe("malformed");
  });

  it("falls back to the provider id and 'unknown' when a malformed candidate has no usable ids", () => {
    const result = gateMedia("not even an object", "fake");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection).toEqual({
        providerId: "fake",
        providerMediaId: "unknown",
        reason: "malformed",
      });
    }
  });
});
