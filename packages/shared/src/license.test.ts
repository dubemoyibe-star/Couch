import { describe, expect, it } from "vitest";
import type { LicenseRecord } from "@couch/contracts";
import { isUseAuthorized } from "./index";

const license: LicenseRecord = {
  licenseName: "Creative Commons Attribution",
  licenseVersion: "4.0",
  licenseUrl: "https://example.com/license",
  sourceUrl: "https://example.com/item",
  rightsholder: "Example Studio",
  attributionRequired: true,
  attribution: "Example Studio, CC BY 4.0",
  intendedUseAllowed: true,
  commercialUseAllowed: true,
  additionalRestrictions: null,
  verifiedAt: "2026-01-15",
  verificationNotes: null,
};

const make = (overrides: Partial<LicenseRecord> = {}): LicenseRecord => ({
  ...license,
  ...overrides,
});

describe("isUseAuthorized", () => {
  it.each([
    { name: "allowed", overrides: {}, expected: true },
    {
      name: "commercial use not allowed does not matter",
      overrides: { commercialUseAllowed: false },
      expected: true,
    },

    // intendedUseAllowed
    { name: "intendedUseAllowed false", overrides: { intendedUseAllowed: false }, expected: false },

    // attribution required
    { name: "attribution required but empty", overrides: { attribution: "" }, expected: false },
    { name: "attribution required but whitespace only", overrides: { attribution: "   " }, expected: false },
    {
      name: "attribution required but only tabs and newlines",
      overrides: { attribution: "\t\n " },
      expected: false,
    },
    { name: "attribution required but null", overrides: { attribution: null }, expected: false },
    {
      name: "attribution required with surrounding whitespace is fine",
      overrides: { attribution: "  Credit  " },
      expected: true,
    },

    // attribution not required
    {
      name: "attribution not required and null",
      overrides: { attributionRequired: false, attribution: null },
      expected: true,
    },
    {
      name: "attribution not required and empty",
      overrides: { attributionRequired: false, attribution: "" },
      expected: true,
    },
    {
      name: "attribution not required and whitespace only",
      overrides: { attributionRequired: false, attribution: "  " },
      expected: true,
    },

    // verifiedAt
    { name: "verifiedAt is a date that does not exist (2026-02-30)", overrides: { verifiedAt: "2026-02-30" }, expected: false },
    { name: "verifiedAt uses slashes", overrides: { verifiedAt: "2026/01/15" }, expected: false },
    { name: "verifiedAt is empty", overrides: { verifiedAt: "" }, expected: false },
    { name: "verifiedAt has one-digit month and day", overrides: { verifiedAt: "2026-1-5" }, expected: false },
    { name: "verifiedAt has no separators", overrides: { verifiedAt: "20260115" }, expected: false },
    { name: "verifiedAt is a date-time", overrides: { verifiedAt: "2026-01-15T00:00:00Z" }, expected: false },
    { name: "verifiedAt has a leading space", overrides: { verifiedAt: " 2026-01-15" }, expected: false },
    { name: "verifiedAt has a trailing newline", overrides: { verifiedAt: "2026-01-15\n" }, expected: false },
    { name: "verifiedAt month 13", overrides: { verifiedAt: "2026-13-01" }, expected: false },
    { name: "verifiedAt month 00", overrides: { verifiedAt: "2026-00-10" }, expected: false },
    { name: "verifiedAt day 00", overrides: { verifiedAt: "2026-01-00" }, expected: false },
    { name: "verifiedAt day 32", overrides: { verifiedAt: "2026-01-32" }, expected: false },
    { name: "verifiedAt April 31", overrides: { verifiedAt: "2026-04-31" }, expected: false },
    { name: "verifiedAt Feb 29 in a non-leap year", overrides: { verifiedAt: "2023-02-29" }, expected: false },
    { name: "verifiedAt Feb 29 in 1900 (not a leap year)", overrides: { verifiedAt: "1900-02-29" }, expected: false },
    { name: "verifiedAt Feb 29 in a leap year", overrides: { verifiedAt: "2024-02-29" }, expected: true },
    { name: "verifiedAt Feb 29 in 2000 (a leap year)", overrides: { verifiedAt: "2000-02-29" }, expected: true },
    { name: "verifiedAt Dec 31", overrides: { verifiedAt: "2025-12-31" }, expected: true },
    { name: "verifiedAt Jan 1", overrides: { verifiedAt: "2026-01-01" }, expected: true },
  ])("$name", ({ overrides, expected }) => {
    expect(isUseAuthorized(make(overrides))).toBe(expected);
  });

  it("does not reject a verifiedAt in the future, because it has no clock", () => {
    expect(isUseAuthorized(make({ verifiedAt: "9999-12-31" }))).toBe(true);
  });

  it("rejects a row whose fields are not the declared types", () => {
    // A database row built without the schema can hold anything. These casts model that.
    const loose = (overrides: Record<string, unknown>) =>
      ({ ...license, ...overrides }) as unknown as LicenseRecord;

    expect(isUseAuthorized(loose({ verifiedAt: undefined }))).toBe(false);
    expect(isUseAuthorized(loose({ verifiedAt: null }))).toBe(false);
    expect(isUseAuthorized(loose({ verifiedAt: 20260115 }))).toBe(false);
    expect(isUseAuthorized(loose({ intendedUseAllowed: "true" }))).toBe(false);
    expect(isUseAuthorized(loose({ intendedUseAllowed: undefined }))).toBe(false);
    expect(isUseAuthorized(loose({ attribution: 42 }))).toBe(false);
  });

  it("does not modify the record it is given", () => {
    const record = make();
    const copy = { ...record };
    isUseAuthorized(record);
    expect(record).toEqual(copy);
  });
});
