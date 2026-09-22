#!/usr/bin/env node
// Fails if code outside packages/database queries the Media or LicenseRecord
// Prisma delegates directly, bypassing the license gate that
// packages/database's catalog functions enforce (see packages/database's
// catalog.ts and docs/LICENSING.md). Plain Node, no dependencies.
//
// Approach, and why: a real TypeScript parser is the accurate way to do this,
// but this check has none, so it uses a text heuristic and is honest about
// that tradeoff:
//   1. Strip comments and string/template literals first (see
//      stripCommentsAndStrings), so a mention inside a comment, a string, or
//      documentation prose does not trigger a false positive.
//   2. Search what remains for `<identifier>.media.<identifier>(` and
//      `<identifier>.licenseRecord.<identifier>(`, that is, a METHOD CALL,
//      not a plain property read. A Prisma delegate is only ever useful as a
//      call (`db.media.findMany(...)`), so requiring the trailing `(` rules
//      out an ordinary field named `media` or `licenseRecord` on some other
//      object (a `payload.media.title` string field, a CSS-in-JS
//      `theme.media.mobile` breakpoint) without weakening real detection.
//   3. When the called method is a known Prisma delegate method (findMany,
//      upsert, and so on), the match is reported as "confirmed".
//   4. Any other `.media.<x>(` or `.licenseRecord.<x>(` call is still
//      reported, as "ambiguous": it might be a non-Prisma object that
//      happens to have a `media` or `licenseRecord` property and a method by
//      that call's name (a false positive), or it might be a real access
//      spelled in a way this heuristic does not recognize (a real problem).
//      The check FAILS on both, on purpose: a false positive the maintainer
//      dismisses by eye is a much smaller cost than a real bypass that
//      silently passes.
// There is no suppression flag. A finding is resolved by fixing the code (or
// by improving this heuristic), never by exempting a path.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

// The one place these delegates may legitimately be used: packages/database
// itself, which is what enforces the license gate on every read.
const EXCLUDED_PREFIX = "packages/database/";

// Only source files can contain the code this check cares about. Docs,
// JSON and config files are excluded so that prose *about* this rule (for
// example in docs/LICENSING.md) is never scanned in the first place.
const SOURCE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs"]);

const PRISMA_DELEGATE_METHODS = new Set([
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
  "fields",
]);

const GATED_DELEGATES = ["media", "licenseRecord"];

/**
 * Blanks out comments and string/template literals, replacing every removed
 * character with a space (newlines are kept as newlines), so match offsets
 * still map onto the original source's lines. No dependency on a real
 * tokenizer: this is a single left-to-right scan that tracks whether it is
 * inside `//`, `/* *\/`, `'...'`, `"..."` or `` `...` ``, with backslash
 * escapes honored inside quotes.
 *
 * Known limitation: a `${...}` interpolation inside a template literal is
 * blanked along with the rest of the template, so real code written inside
 * an interpolation is not scanned. That trade favors fewer false positives
 * over completeness; see the module doc comment for why that is the right
 * default here.
 */
export function stripCommentsAndStrings(source) {
  let out = "";
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }

    if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
      continue;
    }

    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      out += " ";
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < n) {
          out += source[i] === "\n" ? "\n" : " ";
          out += source[i + 1] === "\n" ? "\n" : " ";
          i += 2;
          continue;
        }
        out += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        out += " ";
        i++;
      }
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

/**
 * The core matcher: a pure function over one file's text content. No I/O.
 * Returns one entry per `<ident>.media.<ident>` / `<ident>.licenseRecord.<ident>`
 * match found outside comments and string/template literals.
 */
export function findDirectAccessViolations(content, { path = "<string>" } = {}) {
  const stripped = stripCommentsAndStrings(content);
  const violations = [];

  for (const delegate of GATED_DELEGATES) {
    // Requires a trailing `(`: a Prisma delegate is only ever useful as a method call
    // (`db.media.findMany(...)`), so requiring the call parenthesis rules out plain
    // property reads on an unrelated object (a CSS-in-JS `theme.media.mobile`, a
    // `payload.media.title` string field) without weakening real detection.
    const pattern = new RegExp(`([A-Za-z_$][\\w$]*)\\.${delegate}\\.([A-Za-z_$][\\w$]*)\\s*\\(`, "g");
    let match;
    while ((match = pattern.exec(stripped)) !== null) {
      const [, base, method] = match;
      const confirmed = PRISMA_DELEGATE_METHODS.has(method);
      violations.push({
        path,
        line: lineNumberAt(stripped, match.index),
        delegate,
        base,
        method,
        severity: confirmed ? "confirmed" : "ambiguous",
        snippet: `${base}.${delegate}.${method}`,
      });
    }
  }

  return violations;
}

/** True when a repo-relative, POSIX-separated path is exempt from this scan. */
export function isExcludedPath(path) {
  return path.startsWith(EXCLUDED_PREFIX);
}

/** True when a repo-relative path's extension is a source file this scan reads. */
export function isScannedSourceFile(path) {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return false;
  return SOURCE_EXTENSIONS.has(base.slice(dot + 1).toLowerCase());
}

function listCandidatePaths() {
  // Read-only: lists tracked files plus untracked-but-not-ignored files.
  // Never stages, adds or modifies anything.
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  return output
    .split("\0")
    .filter((path) => path.length > 0)
    .filter((path) => !isExcludedPath(path))
    .filter((path) => isScannedSourceFile(path));
}

function formatViolation(violation) {
  const tag = violation.severity === "confirmed" ? "CONFIRMED" : "AMBIGUOUS";
  return `${violation.path}:${violation.line} [${tag}] ${violation.snippet}(...)`;
}

function main() {
  const paths = listCandidatePaths();

  const violations = [];
  for (const path of paths) {
    let content;
    try {
      content = readFileSync(join(REPO_ROOT, path), "utf8");
    } catch {
      continue; // deleted between listing and read
    }
    violations.push(...findDirectAccessViolations(content, { path }));
  }

  if (violations.length === 0) {
    console.log(`check:no-direct-db-access OK (${paths.length} file(s) scanned)`);
    return;
  }

  console.error(`check:no-direct-db-access FAILED: ${violations.length} possible direct access(es) found.`);
  console.error(
    "Code outside packages/database must go through its catalog functions " +
      "(upsertCatalogMedia, listCatalogMedia, getCatalogMedia, deactivateMissing, " +
      "countMissing), never query .media or .licenseRecord on a Prisma client directly.",
  );
  console.error(
    "AMBIGUOUS entries did not match a known Prisma delegate method call; they may be a " +
      "false positive (an unrelated object with a `media` or `licenseRecord` property). " +
      "Review by eye rather than assuming either way.",
  );
  console.error("");
  for (const violation of violations) {
    console.error(`  ${formatViolation(violation)}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === __filename) {
  main();
}
