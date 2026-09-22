import { describe, expect, it } from "vitest";
import { findMediaViolations, getExtension, parseAllowlist } from "./check-no-media.mjs";

describe("findMediaViolations", () => {
  it("flags a known media extension", () => {
    const violations = findMediaViolations([{ path: "packages/providers/catalog/clip.mp4", size: 100 }]);
    expect(violations).toEqual([
      { path: "packages/providers/catalog/clip.mp4", reason: "extension", extension: "mp4" },
    ]);
  });

  it("flags a file over the size threshold regardless of extension", () => {
    const maxBytes = 5 * 1024 * 1024;
    const violations = findMediaViolations([{ path: "docs/big-diagram.png", size: maxBytes + 1 }], { maxBytes });
    expect(violations).toEqual([{ path: "docs/big-diagram.png", reason: "size", size: maxBytes + 1, maxBytes }]);
  });

  it("does not flag an allowlisted file, for either rule", () => {
    const maxBytes = 5 * 1024 * 1024;
    const allowlist = new Set(["fixtures/approved.mp4", "fixtures/approved-large.bin"]);
    const violations = findMediaViolations(
      [
        { path: "fixtures/approved.mp4", size: 100 },
        { path: "fixtures/approved-large.bin", size: maxBytes + 1 },
      ],
      { maxBytes, allowlist },
    );
    expect(violations).toEqual([]);
  });

  it("does not flag a .ts file, even though it is a video segment extension elsewhere", () => {
    const violations = findMediaViolations([{ path: "packages/contracts/src/index.ts", size: 100 }]);
    expect(violations).toEqual([]);
  });

  it("does not flag a small, non-media file", () => {
    const violations = findMediaViolations([{ path: "README.md", size: 1024 }]);
    expect(violations).toEqual([]);
  });

  it("prefers the extension reason over the size reason when both apply", () => {
    const maxBytes = 5 * 1024 * 1024;
    const violations = findMediaViolations([{ path: "clip.mp4", size: maxBytes + 1 }], { maxBytes });
    expect(violations).toEqual([{ path: "clip.mp4", reason: "extension", extension: "mp4" }]);
  });
});

describe("getExtension", () => {
  it("lowercases the extension", () => {
    expect(getExtension("Movie.MP4")).toBe("mp4");
  });

  it("returns empty for a file with no extension", () => {
    expect(getExtension("Makefile")).toBe("");
  });

  it("returns empty for a dotfile with no further extension", () => {
    expect(getExtension(".gitignore")).toBe("");
  });

  it("reads the extension from a nested path", () => {
    expect(getExtension("packages/providers/catalog/clip.webm")).toBe("webm");
  });
});

describe("parseAllowlist", () => {
  it("ignores blank lines and comments", () => {
    const text = "# comment\n\nfixtures/one.bin\n  \nfixtures/two.bin\n";
    expect(parseAllowlist(text)).toEqual(new Set(["fixtures/one.bin", "fixtures/two.bin"]));
  });
});
