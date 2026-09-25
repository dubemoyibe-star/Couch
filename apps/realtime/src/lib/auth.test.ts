import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("realtime auth", () => {
  it("importing the module needs no environment", () => {
    expect(typeof getAuth).toBe("function");
  });

  it("fails on first use, not at import, when the secret is missing", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    expect(() => getAuth()).toThrow("BETTER_AUTH_SECRET is not set");
  });
});
