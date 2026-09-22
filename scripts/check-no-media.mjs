#!/usr/bin/env node
// Fails if a media file enters the repository. Plain Node, no dependencies:
// candidate files come from `git ls-files`, and the check itself is a pure
// function over paths and sizes so it can be unit tested without touching git
// or the filesystem (see check-no-media.test.mjs).
//
// Two ways a file is flagged:
//   1. Its extension is a known audio/video container or segment format.
//      `.ts` is deliberately NOT in this list: in this repo it is TypeScript,
//      not an MPEG transport stream segment.
//   2. It is over MAX_BYTES, regardless of extension.
// A path listed in ALLOWLIST_FILE is exempt from both checks. Use the
// allowlist only for a justified, reviewed exception; there is no flag that
// disables the check itself.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Audio and video containers and segment formats. Deliberately excludes
// `.ts`: in this repo that extension is TypeScript source, not an MPEG-TS
// segment. Deliberately excludes manifest/playlist text formats (`.m3u8`,
// `.mpd`): they reference media, they are not media themselves.
export const DEFAULT_MEDIA_EXTENSIONS = new Set([
  // audio
  "mp3",
  "wav",
  "flac",
  "aac",
  "ogg",
  "oga",
  "m4a",
  "wma",
  "opus",
  "aiff",
  "alac",
  // video
  "mp4",
  "m4v",
  "mov",
  "avi",
  "mkv",
  "webm",
  "flv",
  "wmv",
  "mpg",
  "mpeg",
  "m2ts",
  "mts",
  "3gp",
  "ogv",
  "vob",
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const ALLOWLIST_FILE = join(__dirname, "media-guard-allowlist.txt");

/** Lowercase extension without the dot, or "" when the path has none. */
export function getExtension(path) {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return ""; // no extension, or a dotfile like ".gitignore"
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Parses the allowlist file format: one repo-relative POSIX path per line,
 * blank lines and lines starting with `#` ignored.
 */
export function parseAllowlist(text) {
  const paths = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    paths.add(line);
  }
  return paths;
}

/**
 * The core check: a pure function over a list of candidate files and their
 * sizes. No I/O. `files` is `{ path, size }[]`, `path` is repo-relative and
 * POSIX-separated. Returns one violation per flagged file.
 */
export function findMediaViolations(
  files,
  { maxBytes = DEFAULT_MAX_BYTES, mediaExtensions = DEFAULT_MEDIA_EXTENSIONS, allowlist = new Set() } = {},
) {
  const violations = [];
  for (const file of files) {
    if (allowlist.has(file.path)) continue;

    const extension = getExtension(file.path);
    if (mediaExtensions.has(extension)) {
      violations.push({ path: file.path, reason: "extension", extension });
      continue;
    }

    if (typeof file.size === "number" && file.size > maxBytes) {
      violations.push({ path: file.path, reason: "size", size: file.size, maxBytes });
    }
  }
  return violations;
}

function listCandidatePaths() {
  // Read-only: lists tracked files plus untracked-but-not-ignored files.
  // Never stages, adds or modifies anything.
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  return output.split("\0").filter((path) => path.length > 0);
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_FILE)) return new Set();
  return parseAllowlist(readFileSync(ALLOWLIST_FILE, "utf8"));
}

function formatViolation(violation) {
  if (violation.reason === "extension") {
    return `${violation.path}: disallowed media extension ".${violation.extension}"`;
  }
  const mb = (violation.size / (1024 * 1024)).toFixed(2);
  const maxMb = (violation.maxBytes / (1024 * 1024)).toFixed(2);
  return `${violation.path}: ${mb} MB exceeds the ${maxMb} MB limit`;
}

function main() {
  const paths = listCandidatePaths();
  const allowlist = loadAllowlist();

  const files = [];
  for (const path of paths) {
    const absolute = join(REPO_ROOT, path);
    let size;
    try {
      size = statSync(absolute).size;
    } catch {
      continue; // deleted between listing and stat; nothing to check
    }
    files.push({ path, size });
  }

  const violations = findMediaViolations(files, { allowlist });

  if (violations.length === 0) {
    console.log(`check:no-media OK (${files.length} candidate file(s) checked)`);
    return;
  }

  console.error(`check:no-media FAILED: ${violations.length} file(s) look like media.`);
  console.error("Media files are never committed. Metadata and links only.");
  console.error(`Justified exceptions go in ${relative(REPO_ROOT, ALLOWLIST_FILE)}, one path per line.`);
  console.error("");
  for (const violation of violations) {
    console.error(`  ${formatViolation(violation)}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === __filename) {
  main();
}
