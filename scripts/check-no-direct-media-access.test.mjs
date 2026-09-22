import { describe, expect, it } from "vitest";
import {
  findDirectAccessViolations,
  isExcludedPath,
  isScannedSourceFile,
  stripCommentsAndStrings,
} from "./check-no-direct-media-access.mjs";

describe("findDirectAccessViolations", () => {
  it("catches a real violation: a Prisma delegate method call on .media", () => {
    const content = `
      const rows = await db.media.findMany({ where: { isActive: true } });
    `;
    const violations = findDirectAccessViolations(content, { path: "apps/web/route.ts" });
    expect(violations).toEqual([
      {
        path: "apps/web/route.ts",
        line: 2,
        delegate: "media",
        base: "db",
        method: "findMany",
        severity: "confirmed",
        snippet: "db.media.findMany",
      },
    ]);
  });

  it("catches a real violation on .licenseRecord", () => {
    const content = `await prisma.licenseRecord.updateMany({ data: { attribution: null } });`;
    const violations = findDirectAccessViolations(content, { path: "apps/web/x.ts" });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ delegate: "licenseRecord", method: "updateMany", severity: "confirmed" });
  });

  it("does not flag a comment mentioning the pattern", () => {
    const content = `
      // Never call db.media.findMany() here, use listCatalogMedia instead.
      const items = await listCatalogMedia(db, { limit: 10 });
    `;
    expect(findDirectAccessViolations(content, { path: "x.ts" })).toEqual([]);
  });

  it("does not flag a string literal mentioning the pattern", () => {
    const content = `const message = "do not call db.media.findMany() directly";`;
    expect(findDirectAccessViolations(content, { path: "x.ts" })).toEqual([]);
  });

  it("does not flag a block comment or a template literal mentioning the pattern", () => {
    const content = [
      "/* legacy note: db.media.findMany() used to live here */",
      "const label = `see db.media.findMany() in the old code`;",
    ].join("\n");
    expect(findDirectAccessViolations(content, { path: "x.ts" })).toEqual([]);
  });

  it("flags an ambiguous case loudly instead of silently passing: unrecognized method name", () => {
    const content = `const x = client.media.someCustomHelper();`;
    const violations = findDirectAccessViolations(content, { path: "x.ts" });
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe("ambiguous");
    expect(violations[0]).toMatchObject({ delegate: "media", base: "client", method: "someCustomHelper" });
  });

  it("flags an ambiguous case even when it is plausibly a false positive (non-Prisma object)", () => {
    // `theme.media.mobile(...)` is a plausible non-Prisma call (a CSS-in-JS breakpoint
    // helper, say), but this heuristic cannot tell the difference reliably once it sees
    // a `<ident>.media.<ident>(` call shape, so it fails loud rather than guessing
    // quietly. The maintainer dismisses it by eye.
    const content = `const width = theme.media.mobile();`;
    const violations = findDirectAccessViolations(content, { path: "x.ts" });
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe("ambiguous");
  });

  it("does not flag a plain property read with no call, even on a Prisma-like base", () => {
    // Requiring a trailing `(` is what keeps a field named `media` or `licenseRecord` on
    // an ordinary object (for example `payload.media.title`) from being flagged: a
    // Prisma delegate is only ever useful as a method call.
    const content = `expect(codePoints(payload.media.title)).toBe(MEDIA_LIMITS.title);`;
    expect(findDirectAccessViolations(content, { path: "x.ts" })).toEqual([]);
  });
});

describe("stripCommentsAndStrings", () => {
  it("preserves line numbers while blanking a line comment", () => {
    const source = "a\n// db.media.findMany()\nb";
    const stripped = stripCommentsAndStrings(source);
    expect(stripped.split("\n")).toHaveLength(3);
    expect(stripped).not.toContain("findMany");
  });

  it("blanks a single- and double-quoted string", () => {
    expect(stripCommentsAndStrings(`'a.media.b'`)).not.toContain("media");
    expect(stripCommentsAndStrings(`"a.media.b"`)).not.toContain("media");
  });

  it("honors backslash escapes inside a string", () => {
    const stripped = stripCommentsAndStrings(`"a \\" still inside a.media.b"`);
    expect(stripped).not.toContain("media");
  });
});

describe("isExcludedPath", () => {
  it("excludes anything under packages/database, where the gate itself lives", () => {
    expect(isExcludedPath("packages/database/src/catalog.ts")).toBe(true);
    expect(isExcludedPath("packages/database/src/catalog.test.ts")).toBe(true);
  });

  it("does not exclude a legitimate caller in apps/web", () => {
    expect(isExcludedPath("apps/web/scripts/sync-catalog.ts")).toBe(false);
  });

  it("does not exclude a look-alike package name", () => {
    expect(isExcludedPath("packages/database-tools/src/index.ts")).toBe(false);
  });
});

describe("isScannedSourceFile", () => {
  it("scans TypeScript and JavaScript source", () => {
    for (const path of ["a.ts", "a.tsx", "a.js", "a.jsx", "a.mjs", "a.cjs"]) {
      expect(isScannedSourceFile(path)).toBe(true);
    }
  });

  it("does not scan docs, JSON or config-like files, so prose about the rule cannot self-trigger", () => {
    for (const path of ["docs/LICENSING.md", "package.json", "README.md"]) {
      expect(isScannedSourceFile(path)).toBe(false);
    }
  });
});
