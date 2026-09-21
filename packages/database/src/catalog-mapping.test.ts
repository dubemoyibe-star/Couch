import { catalogMediaSchema, licenseRecordSchema } from "@couch/contracts";
import { describe, expect, it } from "vitest";
import {
  escapeLikePattern,
  formatDateOnly,
  licenseToRowData,
  parseDateOnly,
  toCatalogCandidate,
  validateRow,
  type CatalogRow,
} from "./catalog-mapping";
import { fixtureMedia } from "./catalog-test-support";

// Pure tests: no database. The date tests are meant to run under different time
// zones too (`TZ=America/Los_Angeles pnpm test`, `TZ=Pacific/Kiritimati pnpm test`).

function makeRow(overrides: Partial<CatalogRow> = {}, license: Partial<CatalogRow["licenseRecord"]> = {}): CatalogRow {
  const at = new Date("2026-03-04T05:06:07.000Z");
  return {
    id: "row-1",
    providerId: "test-provider",
    providerMediaId: "fixture-1",
    title: "TEST FIXTURE Title",
    description: "TEST FIXTURE description",
    durationSeconds: 5400.5,
    posterUrl: "https://example.com/poster.png",
    releaseYear: 1999,
    isActive: true,
    createdAt: at,
    updatedAt: at,
    licenseRecordId: "license-1",
    ...overrides,
    licenseRecord: {
      id: "license-1",
      licenseName: "TEST FIXTURE License",
      licenseVersion: "1.0",
      licenseUrl: "https://example.com/license",
      sourceUrl: "https://example.com/items/1",
      rightsholder: "TEST FIXTURE Rightsholder",
      attributionRequired: true,
      attribution: "TEST FIXTURE attribution",
      intendedUseAllowed: true,
      commercialUseAllowed: false,
      additionalRestrictions: null,
      verifiedAt: new Date("2026-02-03T00:00:00.000Z"),
      verificationNotes: null,
      createdAt: at,
      updatedAt: at,
      ...license,
    },
  };
}

describe("verifiedAt dates", () => {
  const edgeDates = [
    "2024-02-29",
    "2026-01-01",
    "2026-12-31",
    "2026-03-08", // a daylight saving change in Los Angeles
    "1994-12-31", // a day that never happened on Kiritimati
    "1999-12-31",
    "0999-01-01",
    "0050-06-15",
    "9999-12-31",
  ];

  it("round-trips the edge dates exactly", () => {
    for (const value of edgeDates) {
      expect(formatDateOnly(parseDateOnly(value))).toBe(value);
    }
  });

  it("round-trips every day of a leap year and a normal year", () => {
    for (const year of [2024, 2026]) {
      for (let ms = Date.UTC(year, 0, 1); ms < Date.UTC(year + 1, 0, 1); ms += 86_400_000) {
        const iso = new Date(ms).toISOString().slice(0, 10);
        expect(formatDateOnly(parseDateOnly(iso))).toBe(iso);
      }
    }
  });

  it("stores UTC midnight, whatever the process time zone", () => {
    expect(parseDateOnly("2026-02-03").toISOString()).toBe("2026-02-03T00:00:00.000Z");
  });

  it("formats from the UTC parts of a Date at UTC midnight", () => {
    expect(formatDateOnly(new Date("2026-02-03T00:00:00.000Z"))).toBe("2026-02-03");
    // Late in the UTC day still belongs to that UTC day.
    expect(formatDateOnly(new Date("2026-02-03T23:59:59.999Z"))).toBe("2026-02-03");
  });
});

describe("toCatalogCandidate", () => {
  it("builds exactly the fields the strict ingest schema expects", () => {
    const candidate = toCatalogCandidate(makeRow());
    expect(Object.keys(candidate).sort()).toEqual(Object.keys(catalogMediaSchema.shape).sort());
    expect(Object.keys(candidate.license).sort()).toEqual(
      Object.keys(licenseRecordSchema.shape).sort(),
    );
    expect(candidate).not.toHaveProperty("isActive");
    expect(candidate).not.toHaveProperty("licenseRecordId");
    expect(candidate).not.toHaveProperty("createdAt");
  });

  it("keeps null as null and never produces undefined", () => {
    const candidate = toCatalogCandidate(
      makeRow(
        { description: null, durationSeconds: null, posterUrl: null, releaseYear: null },
        {
          licenseVersion: null,
          rightsholder: null,
          attributionRequired: false,
          attribution: null,
          additionalRestrictions: null,
          verificationNotes: null,
        },
      ),
    );
    const values = [...Object.values(candidate), ...Object.values(candidate.license)];
    expect(values).not.toContain(undefined);
    expect(candidate.description).toBeNull();
    expect(candidate.durationSeconds).toBeNull();
    expect(candidate.posterUrl).toBeNull();
    expect(candidate.releaseYear).toBeNull();
    expect(candidate.license.licenseVersion).toBeNull();
    expect(candidate.license.rightsholder).toBeNull();
    expect(candidate.license.attribution).toBeNull();
    expect(candidate.license.additionalRestrictions).toBeNull();
    expect(candidate.license.verificationNotes).toBeNull();
  });

  it("formats verifiedAt as YYYY-MM-DD", () => {
    const candidate = toCatalogCandidate(
      makeRow({}, { verifiedAt: new Date("2024-02-29T00:00:00.000Z") }),
    );
    expect(candidate.license.verifiedAt).toBe("2024-02-29");
  });
});

describe("licenseToRowData", () => {
  it("writes every license field and the date as UTC midnight", () => {
    const { license } = fixtureMedia("test-provider", "fixture-1", "TEST FIXTURE Title");
    const data = licenseToRowData(license);
    expect(Object.keys(data).sort()).toEqual(Object.keys(licenseRecordSchema.shape).sort());
    expect(data.verifiedAt.toISOString()).toBe("2026-02-03T00:00:00.000Z");
  });
});

describe("validateRow", () => {
  it("accepts a good row and returns the contracts shape", () => {
    const result = validateRow(makeRow());
    expect(result).toEqual({ ok: true, media: toCatalogCandidate(makeRow()) });
  });

  it("excludes an inactive row", () => {
    expect(validateRow(makeRow({ isActive: false }))).toEqual({ ok: false, reason: "inactive" });
  });

  it("excludes a row whose license does not allow the intended use", () => {
    expect(validateRow(makeRow({}, { intendedUseAllowed: false }))).toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  it("excludes attribution required with no attribution as unauthorized", () => {
    expect(
      validateRow(makeRow({}, { attributionRequired: true, attribution: null })),
    ).toEqual({ ok: false, reason: "unauthorized" });
    expect(
      validateRow(makeRow({}, { attributionRequired: true, attribution: "   " })),
    ).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("excludes an invalid verifiedAt as unauthorized", () => {
    expect(
      validateRow(makeRow({}, { verifiedAt: new Date(Number.NaN) })),
    ).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("excludes a row the schema rejects as malformed", () => {
    for (const bad of [
      makeRow({ posterUrl: "http://example.com/poster.png" }),
      makeRow({ description: "" }),
      makeRow({ title: "" }),
      makeRow({ providerId: "Not A Slug" }),
      makeRow({ durationSeconds: -1 }),
      makeRow({ releaseYear: 3000 }),
      makeRow({}, { licenseUrl: "http://example.com/license" }),
      makeRow({}, { licenseName: "" }),
    ]) {
      expect(validateRow(bad)).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("never reports row contents in a result", () => {
    const result = validateRow(makeRow({ posterUrl: "http://secret.example.com/x" }));
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

describe("escapeLikePattern", () => {
  it("escapes backslash, percent and underscore", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("%_\\")).toBe("\\%\\_\\\\");
  });

  it("leaves other text alone", () => {
    expect(escapeLikePattern("plain title 42")).toBe("plain title 42");
    expect(escapeLikePattern("")).toBe("");
  });
});
