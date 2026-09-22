import { describe, expect, it } from "vitest";
import { ProviderError, isProviderError } from "./errors";

describe("ProviderError", () => {
  it("carries a stable code, the providerId, and the message", () => {
    const error = new ProviderError("not_found", "test-provider", "no such item");

    expect(error.code).toBe("not_found");
    expect(error.providerId).toBe("test-provider");
    expect(error.message).toBe("no such item");
    expect(error.name).toBe("ProviderError");
  });

  it("is a real Error instance", () => {
    const error = new ProviderError("unavailable", "test-provider", "upstream down");

    expect(error).toBeInstanceOf(Error);
  });
});

describe("isProviderError", () => {
  it("returns true for a ProviderError", () => {
    const error = new ProviderError("unsupported", "test-provider", "search not implemented");

    expect(isProviderError(error)).toBe(true);
  });

  it("returns false for a plain Error", () => {
    expect(isProviderError(new Error("boom"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isProviderError(undefined)).toBe(false);
    expect(isProviderError(null)).toBe(false);
    expect(isProviderError("not_found")).toBe(false);
  });
});
