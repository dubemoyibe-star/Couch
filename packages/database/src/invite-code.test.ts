import { describe, expect, it, vi } from "vitest";
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_BITS,
  INVITE_CODE_LENGTH,
  MAX_INVITE_CODE_ATTEMPTS,
  generateInviteCode,
  withInviteCodeRetry,
} from "./invite-code";

describe("invite code alphabet and length", () => {
  it("has 31 lowercase, URL-safe characters with no ambiguous glyphs", () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(31);
    expect(INVITE_CODE_ALPHABET).toMatch(/^[a-z0-9]+$/);
    // 0/o and 1/l/i are the characters people commonly confuse.
    for (const excluded of ["0", "1", "i", "l", "o"]) {
      expect(INVITE_CODE_ALPHABET).not.toContain(excluded);
    }
    // No duplicate characters.
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(INVITE_CODE_ALPHABET.length);
  });

  it("generates codes of the documented length, from the documented alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      for (const char of code) {
        expect(INVITE_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it("states at least 80 bits of entropy", () => {
    expect(INVITE_CODE_BITS).toBeCloseTo(INVITE_CODE_LENGTH * Math.log2(31), 5);
    expect(INVITE_CODE_BITS).toBeGreaterThanOrEqual(80);
  });

  it("generates practically unique codes across many calls", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateInviteCode()));
    expect(codes.size).toBe(2000);
  });
});

describe("withInviteCodeRetry", () => {
  class FakeCollisionError extends Error {}
  const isCollision = (error: unknown) => error instanceof FakeCollisionError;

  it("succeeds on the first attempt when there is no collision", async () => {
    const attempt = vi.fn(async (code: string) => `ok:${code}`);
    const result = await withInviteCodeRetry(attempt, {
      generate: () => "codeA",
      isCollision,
    });
    expect(result).toBe("ok:codeA");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries with a freshly generated code after a collision", async () => {
    const codes = ["dup1", "dup2", "free3"];
    let call = 0;
    const generate = () => codes[call++] ?? "unused";
    const attempt = vi.fn(async (code: string) => {
      if (code === "dup1" || code === "dup2") throw new FakeCollisionError("unique constraint");
      return `ok:${code}`;
    });

    const result = await withInviteCodeRetry(attempt, { generate, isCollision });

    expect(result).toBe("ok:free3");
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(attempt.mock.calls.map((call) => call[0])).toEqual(["dup1", "dup2", "free3"]);
  });

  it("rethrows a non-collision error immediately, without retrying", async () => {
    const otherError = new Error("connection refused");
    const attempt = vi.fn(async () => {
      throw otherError;
    });

    await expect(withInviteCodeRetry(attempt, { isCollision })).rejects.toBe(otherError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries and rethrows the last collision error", async () => {
    const attempt = vi.fn(async () => {
      throw new FakeCollisionError("unique constraint");
    });

    await expect(withInviteCodeRetry(attempt, { isCollision })).rejects.toBeInstanceOf(
      FakeCollisionError,
    );
    expect(attempt).toHaveBeenCalledTimes(MAX_INVITE_CODE_ATTEMPTS);
  });

  it("honors a smaller maxAttempts override", async () => {
    const attempt = vi.fn(async () => {
      throw new FakeCollisionError("unique constraint");
    });

    await expect(
      withInviteCodeRetry(attempt, { isCollision, maxAttempts: 2 }),
    ).rejects.toBeInstanceOf(FakeCollisionError);
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
