import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod";
import * as api from "./index";
import {
  MEDIA_LIMITS,
  catalogMediaSchema,
  catalogMediaWireSchema,
  licenseRecordSchema,
  licenseRecordWireSchema,
  mediaRefSchema,
  mediaWithLicenseSchema,
  playbackSourceSchema,
  type CatalogMedia,
  type LicenseRecord,
  type MediaRef,
  type MediaWithLicense,
  type PlaybackSource,
} from "./index";

// Every fixture is fake. Titles start with "TEST FIXTURE" and hosts are reserved names.
const license: LicenseRecord = {
  licenseName: "TEST FIXTURE License",
  licenseVersion: "1.0",
  licenseUrl: "https://example.invalid/license",
  sourceUrl: "https://example.invalid/items/1",
  rightsholder: "TEST FIXTURE Rightsholder",
  attributionRequired: true,
  attribution: "TEST FIXTURE attribution text",
  intendedUseAllowed: true,
  commercialUseAllowed: false,
  additionalRestrictions: null,
  verifiedAt: "2026-02-03",
  verificationNotes: null,
};

const mediaWithLicense: MediaWithLicense = {
  providerId: "test-provider",
  providerMediaId: "fixture-1",
  title: "TEST FIXTURE Title",
  description: "TEST FIXTURE description",
  durationSeconds: 5400,
  posterUrl: "https://example.com/poster.png",
  releaseYear: 1999,
  license,
};

const catalogMedia: CatalogMedia = { id: "cat-1", ...mediaWithLicense };

const ok = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

/** A copy of `value` without `key`, so a test can express "this key is missing". */
function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)) as Omit<T, K>;
}

/** The Zod issue codes and paths of a failed parse, so tests assert the reason. */
function issues(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) throw new Error("expected a failure");
  return result.error.issues.map((issue) => ({ code: issue.code, path: issue.path }));
}

describe("licenseRecordSchema", () => {
  it("accepts a valid record and returns it unchanged", () => {
    expect(licenseRecordSchema.parse(license)).toEqual(license);
  });

  it("accepts null for every nullable field", () => {
    expect(
      ok(licenseRecordSchema, {
        ...license,
        licenseVersion: null,
        rightsholder: null,
        attributionRequired: false,
        attribution: null,
        additionalRestrictions: null,
        verificationNotes: null,
      }),
    ).toBe(true);
  });

  it("requires every field, including the nullable ones", () => {
    for (const key of Object.keys(license) as (keyof LicenseRecord)[]) {
      expect(ok(licenseRecordSchema, omit(license, key)), `missing ${key}`).toBe(false);
    }
  });

  it("trims strings and rejects empty or whitespace-only values", () => {
    expect(licenseRecordSchema.parse({ ...license, licenseName: "  TEST FIXTURE  " }).licenseName).toBe(
      "TEST FIXTURE",
    );
    expect(ok(licenseRecordSchema, { ...license, licenseName: "" })).toBe(false);
    expect(ok(licenseRecordSchema, { ...license, licenseName: "   " })).toBe(false);
    expect(ok(licenseRecordSchema, { ...license, rightsholder: "  " })).toBe(false);
    expect(ok(licenseRecordSchema, { ...license, additionalRestrictions: "" })).toBe(false);
  });

  describe("attribution rule", () => {
    const required = { ...license, attributionRequired: true };

    it("fails when required and attribution is empty", () => {
      expect(ok(licenseRecordSchema, { ...required, attribution: "" })).toBe(false);
    });

    it("fails when required and attribution is whitespace-only", () => {
      expect(ok(licenseRecordSchema, { ...required, attribution: "   \t " })).toBe(false);
    });

    it("fails when required and attribution is null", () => {
      expect(issues(licenseRecordSchema, { ...required, attribution: null })).toEqual([
        { code: "custom", path: ["attribution"] },
      ]);
    });

    it("fails when required and attribution is missing", () => {
      expect(ok(licenseRecordSchema, omit(required, "attribution"))).toBe(false);
    });

    it("passes when required and attribution has text", () => {
      expect(ok(licenseRecordSchema, { ...required, attribution: "TEST FIXTURE credit" })).toBe(true);
    });

    it("does not require attribution when attributionRequired is false", () => {
      expect(ok(licenseRecordSchema, { ...license, attributionRequired: false, attribution: null })).toBe(true);
    });
  });

  describe("verifiedAt", () => {
    it.each(["2026-02-03", "2024-02-29", "1999-12-31"])("accepts %s", (date) => {
      expect(ok(licenseRecordSchema, { ...license, verifiedAt: date })).toBe(true);
    });

    it.each([
      ["an impossible day", "2026-02-30"],
      ["Feb 29 in a non-leap year", "2026-02-29"],
      ["Apr 31", "2026-04-31"],
      ["month 13", "2026-13-01"],
      ["month 00", "2026-00-10"],
      ["day 00", "2026-01-00"],
      ["unpadded parts", "2026-2-3"],
      ["compact form", "20260203"],
      ["a datetime", "2026-02-03T00:00:00Z"],
      ["a day-first form", "03/02/2026"],
      ["leading whitespace", " 2026-02-03"],
      ["an empty string", ""],
    ])("rejects %s (%s)", (_label, date) => {
      expect(ok(licenseRecordSchema, { ...license, verifiedAt: date })).toBe(false);
    });

    it("rejects a non-string", () => {
      expect(ok(licenseRecordSchema, { ...license, verifiedAt: 20260203 })).toBe(false);
    });
  });

  it("enforces the field limits", () => {
    expect(ok(licenseRecordSchema, { ...license, attribution: "a".repeat(MEDIA_LIMITS.attribution) })).toBe(true);
    expect(ok(licenseRecordSchema, { ...license, attribution: "a".repeat(MEDIA_LIMITS.attribution + 1) })).toBe(
      false,
    );
    expect(ok(licenseRecordSchema, { ...license, licenseName: "a".repeat(MEDIA_LIMITS.licenseName + 1) })).toBe(false);
    expect(
      ok(licenseRecordSchema, { ...license, verificationNotes: "a".repeat(MEDIA_LIMITS.verificationNotes + 1) }),
    ).toBe(false);
  });
});

describe("URL rules", () => {
  const withUrl = (url: unknown) => ({ ...license, licenseUrl: url });

  it.each([
    "https://example.invalid/license",
    "https://example.com",
    "https://example.com:8443/path?q=1#frag",
    "https://example.invalid/a@b",
    "https://example.invalid/?email=a@b",
    "https://example.invalid#u@x",
  ])("accepts %s", (url) => {
    expect(ok(licenseRecordSchema, withUrl(url))).toBe(true);
  });

  it.each([
    ["http", "http://example.invalid/license"],
    ["ftp", "ftp://example.invalid/license"],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:text/plain,hello"],
    ["file", "file:///etc/hosts"],
    ["scheme-relative", "//example.invalid/license"],
    ["no scheme", "example.invalid/license"],
    ["scheme without slashes", "https:example.invalid/license"],
    ["empty", ""],
    ["whitespace", "   "],
    ["not a url", "not a url"],
    ["a leading control character", "\u0001https://example.invalid/"],
  ])("rejects %s", (_label, url) => {
    expect(ok(licenseRecordSchema, withUrl(url))).toBe(false);
  });

  it.each([
    ["username and password", "https://user:pass@example.invalid/x"],
    ["username only", "https://user@example.invalid/x"],
    ["empty userinfo", "https://@example.invalid/x"],
    ["extra slashes before userinfo", "https:////user:pass@example.invalid/x"],
    ["backslashes before userinfo", "https:\\\\user@example.invalid/x"],
    ["uppercase scheme", "HTTPS://user@example.invalid/x"],
    ["a tab inside the userinfo", "https://us\ter@example.invalid/x"],
    ["two @ signs", "https://a@b@example.invalid/x"],
  ])("rejects credentials: %s", (_label, url) => {
    expect(ok(licenseRecordSchema, withUrl(url))).toBe(false);
  });

  it("rejects a URL over the length limit", () => {
    const long = "https://example.invalid/" + "a".repeat(MEDIA_LIMITS.url);
    expect(ok(licenseRecordSchema, withUrl(long))).toBe(false);
  });

  it("applies the same rules to every url field", () => {
    expect(ok(licenseRecordSchema, { ...license, sourceUrl: "http://example.invalid/x" })).toBe(false);
    expect(ok(licenseRecordSchema, { ...license, sourceUrl: "https://u:p@example.invalid/x" })).toBe(false);
    expect(ok(mediaWithLicenseSchema, { ...mediaWithLicense, posterUrl: "http://example.com/p.png" })).toBe(false);
    expect(ok(mediaWithLicenseSchema, { ...mediaWithLicense, posterUrl: "https://u:p@example.com/p.png" })).toBe(
      false,
    );
    expect(ok(playbackSourceSchema, { kind: "mp4", url: "http://example.invalid/v.mp4" })).toBe(false);
    expect(ok(playbackSourceSchema, { kind: "mp4", url: "https://u:p@example.invalid/v.mp4" })).toBe(false);
  });
});

describe("mediaWithLicenseSchema and catalogMediaSchema", () => {
  it("accepts valid media and returns it unchanged", () => {
    expect(mediaWithLicenseSchema.parse(mediaWithLicense)).toEqual(mediaWithLicense);
    expect(catalogMediaSchema.parse(catalogMedia)).toEqual(catalogMedia);
  });

  it("accepts null for the nullable fields", () => {
    const sparse = {
      ...catalogMedia,
      description: null,
      durationSeconds: null,
      posterUrl: null,
      releaseYear: null,
    };
    expect(ok(catalogMediaSchema, sparse)).toBe(true);
  });

  it("fails without a license", () => {
    const noLicense = omit(catalogMedia, "license");
    expect(issues(catalogMediaSchema, noLicense)).toEqual([{ code: "invalid_type", path: ["license"] }]);
    expect(ok(mediaWithLicenseSchema, { ...noLicense, id: undefined })).toBe(false);
    expect(ok(catalogMediaWireSchema, noLicense)).toBe(false);
  });

  it("fails with a null or empty license", () => {
    expect(ok(catalogMediaSchema, { ...catalogMedia, license: null })).toBe(false);
    expect(ok(catalogMediaSchema, { ...catalogMedia, license: {} })).toBe(false);
    expect(ok(catalogMediaWireSchema, { ...catalogMedia, license: {} })).toBe(false);
  });

  it("enforces the license rules inside media", () => {
    const badLicense = { ...license, attributionRequired: true, attribution: "  " };
    expect(ok(catalogMediaSchema, { ...catalogMedia, license: badLicense })).toBe(false);
    expect(ok(catalogMediaWireSchema, { ...catalogMedia, license: badLicense })).toBe(false);
  });

  it("requires a non-empty id on catalog media, and no id is part of MediaWithLicense", () => {
    expect(ok(catalogMediaSchema, { ...catalogMedia, id: "" })).toBe(false);
    expect(ok(catalogMediaSchema, { ...catalogMedia, id: "   " })).toBe(false);
    expect(ok(catalogMediaSchema, mediaWithLicense)).toBe(false);
    expect(ok(mediaWithLicenseSchema, catalogMedia)).toBe(false);
  });

  describe("providerId", () => {
    it.each(["a", "test-provider", "p2p", "a-b-c-1"])("accepts %s", (providerId) => {
      expect(ok(catalogMediaSchema, { ...catalogMedia, providerId })).toBe(true);
    });

    it.each(["Test", "test_provider", "test provider", "-a", "a-", "a--b", "", "über"])(
      "rejects %s",
      (providerId) => {
        expect(ok(catalogMediaSchema, { ...catalogMedia, providerId })).toBe(false);
      },
    );
  });

  it("requires a non-empty providerMediaId and trims it", () => {
    expect(ok(catalogMediaSchema, { ...catalogMedia, providerMediaId: "" })).toBe(false);
    expect(ok(catalogMediaSchema, { ...catalogMedia, providerMediaId: "  " })).toBe(false);
    expect(catalogMediaSchema.parse({ ...catalogMedia, providerMediaId: " x " }).providerMediaId).toBe("x");
  });

  it("requires a non-empty title and a non-empty description when present", () => {
    expect(ok(catalogMediaSchema, { ...catalogMedia, title: "  " })).toBe(false);
    expect(ok(catalogMediaSchema, { ...catalogMedia, description: "" })).toBe(false);
    expect(ok(catalogMediaSchema, { ...catalogMedia, title: "a".repeat(MEDIA_LIMITS.title + 1) })).toBe(false);
    expect(ok(catalogMediaSchema, { ...catalogMedia, description: "a".repeat(MEDIA_LIMITS.description + 1) })).toBe(
      false,
    );
  });

  describe("durationSeconds", () => {
    it.each([0.5, 1, 5400])("accepts %s", (durationSeconds) => {
      expect(ok(catalogMediaSchema, { ...catalogMedia, durationSeconds })).toBe(true);
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, "90"])("rejects %s", (durationSeconds) => {
      expect(ok(catalogMediaSchema, { ...catalogMedia, durationSeconds })).toBe(false);
    });
  });

  describe("releaseYear", () => {
    it.each([MEDIA_LIMITS.releaseYearMin, 1999, MEDIA_LIMITS.releaseYearMax])("accepts %s", (releaseYear) => {
      expect(ok(catalogMediaSchema, { ...catalogMedia, releaseYear })).toBe(true);
    });

    it.each([MEDIA_LIMITS.releaseYearMin - 1, MEDIA_LIMITS.releaseYearMax + 1, 1999.5, "1999"])(
      "rejects %s",
      (releaseYear) => {
        expect(ok(catalogMediaSchema, { ...catalogMedia, releaseYear })).toBe(false);
      },
    );
  });
});

describe("mediaRefSchema", () => {
  const ref: MediaRef = { providerId: "test-provider", providerMediaId: "fixture-1" };

  it("accepts a valid ref", () => {
    expect(mediaRefSchema.parse(ref)).toEqual(ref);
  });

  it("rejects a bad ref, a missing key and an unknown key", () => {
    expect(ok(mediaRefSchema, { ...ref, providerId: "Bad Id" })).toBe(false);
    expect(ok(mediaRefSchema, { providerId: "test-provider" })).toBe(false);
    expect(ok(mediaRefSchema, { ...ref, extra: 1 })).toBe(false);
  });
});

describe("playbackSourceSchema", () => {
  it.each(["mp4", "hls", "dash", "embed"] as const)("accepts kind %s", (kind) => {
    const source = { kind, url: "https://example.invalid/media" };
    expect(playbackSourceSchema.parse(source)).toEqual(source);
  });

  it("accepts a safe-integer expiresAt and treats it as optional", () => {
    expect(ok(playbackSourceSchema, { kind: "hls", url: "https://example.invalid/m", expiresAt: 1_700_000_000_000 })).toBe(
      true,
    );
    expect(ok(playbackSourceSchema, { kind: "hls", url: "https://example.invalid/m" })).toBe(true);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, "1700000000000", null])(
    "rejects expiresAt %s",
    (expiresAt) => {
      expect(ok(playbackSourceSchema, { kind: "mp4", url: "https://example.invalid/m", expiresAt })).toBe(false);
    },
  );

  it("rejects an unknown kind, a missing url and an unknown key", () => {
    expect(ok(playbackSourceSchema, { kind: "rtmp", url: "https://example.invalid/m" })).toBe(false);
    expect(ok(playbackSourceSchema, { kind: "mp4" })).toBe(false);
    expect(ok(playbackSourceSchema, { url: "https://example.invalid/m" })).toBe(false);
    expect(ok(playbackSourceSchema, { kind: "mp4", url: "https://example.invalid/m", extra: 1 })).toBe(false);
  });

  it("narrows on kind", () => {
    const source: PlaybackSource = { kind: "dash", url: "https://example.invalid/m" };
    if (source.kind === "dash") expectTypeOf(source.kind).toEqualTypeOf<"dash">();
    expectTypeOf<PlaybackSource["kind"]>().toEqualTypeOf<"mp4" | "hls" | "dash" | "embed">();
  });
});

describe("strict (ingest) versus tolerant (wire)", () => {
  // A typo of `additionalRestrictions`. Stripping it would silently drop a restriction.
  const typoLicense = { ...license, additionalRestrictons: "TEST FIXTURE: no reuse" };
  const typoMedia = { ...catalogMedia, license: typoLicense };

  it("ingest license rejects an unknown key and names it", () => {
    const result = licenseRecordSchema.safeParse(typoLicense);
    expect(result.success).toBe(false);
    if (!result.success) {
      const [issue] = result.error.issues;
      expect(issue?.code).toBe("unrecognized_keys");
      expect(issue).toMatchObject({ keys: ["additionalRestrictons"] });
    }
  });

  it("wire license strips an unknown key and keeps the known ones", () => {
    const result = licenseRecordWireSchema.parse(typoLicense);
    expect(result).toEqual(license);
    expect(result).not.toHaveProperty("additionalRestrictons");
  });

  it("ingest media rejects an unknown key at the top level and inside the license", () => {
    expect(issues(catalogMediaSchema, { ...catalogMedia, extra: 1 })).toEqual([
      { code: "unrecognized_keys", path: [] },
    ]);
    expect(issues(catalogMediaSchema, typoMedia)).toEqual([
      { code: "unrecognized_keys", path: ["license"] },
    ]);
    expect(ok(mediaWithLicenseSchema, { ...mediaWithLicense, extra: 1 })).toBe(false);
    expect(ok(mediaWithLicenseSchema, { ...mediaWithLicense, license: typoLicense })).toBe(false);
  });

  it("wire media strips an unknown key at the top level and inside the license", () => {
    const result = catalogMediaWireSchema.parse({ ...typoMedia, extra: 1 });
    expect(result).toEqual(catalogMedia);
    expect(result).not.toHaveProperty("extra");
    expect(result.license).not.toHaveProperty("additionalRestrictons");
  });

  it("wire flavors enforce every rule except unknown keys", () => {
    expect(ok(licenseRecordWireSchema, { ...license, licenseUrl: "http://example.invalid/x" })).toBe(false);
    expect(ok(licenseRecordWireSchema, { ...license, verifiedAt: "2026-02-30" })).toBe(false);
    expect(ok(licenseRecordWireSchema, { ...license, attributionRequired: true, attribution: " " })).toBe(false);
    expect(ok(catalogMediaWireSchema, { ...catalogMedia, id: "" })).toBe(false);
    expect(ok(catalogMediaWireSchema, { ...catalogMedia, durationSeconds: 0 })).toBe(false);
  });

  it("both flavors are built from one shape, so they have the same keys and the same output type", () => {
    expect(Object.keys(licenseRecordWireSchema.shape)).toEqual(Object.keys(licenseRecordSchema.shape));
    expect(Object.keys(catalogMediaWireSchema.shape)).toEqual(Object.keys(catalogMediaSchema.shape));
    expectTypeOf<z.infer<typeof licenseRecordWireSchema>>().toEqualTypeOf<LicenseRecord>();
    expectTypeOf<z.infer<typeof catalogMediaWireSchema>>().toEqualTypeOf<CatalogMedia>();
  });

  it("gives identical output for valid input in both flavors", () => {
    expect(catalogMediaWireSchema.parse(catalogMedia)).toEqual(catalogMediaSchema.parse(catalogMedia));
  });
});

describe("public exports", () => {
  const licenseless = omit(catalogMedia, "license");

  it("exports no schema or name for media without a license", () => {
    const mediaNames = Object.keys(api)
      .filter((name) => /media/i.test(name))
      .sort();
    expect(mediaNames).toEqual([
      "MEDIA_LIMITS",
      "catalogMediaSchema",
      "catalogMediaWireSchema",
      "mediaRefSchema",
      "mediaWithLicenseSchema",
    ]);
  });

  it("has no exported schema that accepts media without a license", () => {
    const isSchema = (value: unknown): value is z.ZodType =>
      typeof value === "object" && value !== null && "safeParse" in value;
    const schemas = Object.entries(api as Record<string, unknown>).flatMap(([name, value]) =>
      isSchema(value) ? [[name, value] as const] : [],
    );
    expect(schemas.length).toBeGreaterThan(0);
    for (const [name, schema] of schemas) {
      expect(schema.safeParse(licenseless).success, name).toBe(false);
      // The same holds when the id is dropped, so no schema accepts either license-less shape.
      expect(schema.safeParse(omit(licenseless, "id")).success, name).toBe(false);
    }
  });
});

describe("types", () => {
  it("always carries a license on CatalogMedia and MediaWithLicense", () => {
    expectTypeOf<CatalogMedia["license"]>().toEqualTypeOf<LicenseRecord>();
    expectTypeOf<MediaWithLicense["license"]>().toEqualTypeOf<LicenseRecord>();

    // @ts-expect-error a CatalogMedia without a license does not compile
    const missing: CatalogMedia = { ...catalogMedia, license: undefined };
    // @ts-expect-error a CatalogMedia with a null license does not compile
    const nulled: CatalogMedia = { ...catalogMedia, license: null };
    // @ts-expect-error a MediaWithLicense without a license does not compile
    const missingBase: MediaWithLicense = { ...mediaWithLicense, license: undefined };
    const withoutLicense: Omit<MediaWithLicense, "license"> = mediaWithLicense;
    // @ts-expect-error media fields alone are not a MediaWithLicense
    const alone: MediaWithLicense = withoutLicense;
    void [missing, nulled, missingBase, alone];
  });

  it("makes the license fields required, with null spelled out for absent values", () => {
    expectTypeOf<LicenseRecord["licenseVersion"]>().toEqualTypeOf<string | null>();
    expectTypeOf<LicenseRecord["attribution"]>().toEqualTypeOf<string | null>();
    expectTypeOf<LicenseRecord["attributionRequired"]>().toEqualTypeOf<boolean>();
    expectTypeOf<LicenseRecord["verifiedAt"]>().toEqualTypeOf<string>();
    expectTypeOf<CatalogMedia["id"]>().toEqualTypeOf<string>();
  });
});
