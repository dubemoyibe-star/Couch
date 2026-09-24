import { describe, expect, it } from "vitest";
import { parseInviteCode } from "./invite-input";

describe("parseInviteCode", () => {
  it("accepts a bare code", () => {
    expect(parseInviteCode("  abcd2345efgh6789j ")).toBe("abcd2345efgh6789j");
  });

  it("extracts the code from an invite link", () => {
    expect(parseInviteCode("https://couch.example/join/abcd2345efgh6789j")).toBe("abcd2345efgh6789j");
    expect(parseInviteCode("http://localhost:3000/join/abcd2345efgh6789j/?x=1#top")).toBe("abcd2345efgh6789j");
  });

  it("rejects empty and malformed input", () => {
    expect(parseInviteCode("")).toBeNull();
    expect(parseInviteCode("   ")).toBeNull();
    expect(parseInviteCode("short")).toBeNull();
    expect(parseInviteCode("https://couch.example/join/has space in it")).toBeNull();
    expect(parseInviteCode("https://couch.example/")).toBeNull();
  });
});
