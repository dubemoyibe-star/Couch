import { describe, expect, it } from "vitest";
import { couchMonogram, couchPosterClass } from "./couch-poster";

describe("couchPosterClass", () => {
  it("is stable for the same seed", () => {
    expect(couchPosterClass("abc")).toBe(couchPosterClass("abc"));
  });

  it("always returns a gradient class", () => {
    for (const seed of ["", "a", "Movie night", "😀"]) {
      expect(couchPosterClass(seed)).toContain("bg-linear-");
    }
  });
});

describe("couchMonogram", () => {
  it("uppercases the first letter", () => {
    expect(couchMonogram("  friday film club")).toBe("F");
  });

  it("handles emoji and empty names", () => {
    expect(couchMonogram("😀 fun")).toBe("😀");
    expect(couchMonogram("   ")).toBe("C");
  });
});
