import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnvFile } from "./env-files";

describe("loadEnvFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "couch-env-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads the file and reports it", () => {
    const path = join(dir, ".env.fake");
    writeFileSync(path, "COUCH_DB_ENV=dev\nDATABASE_URL=postgresql://u:p@a.example.com/x\n");
    const target: Record<string, string | undefined> = {};
    expect(loadEnvFile(path, target)).toBe(true);
    expect(target).toEqual({
      COUCH_DB_ENV: "dev",
      DATABASE_URL: "postgresql://u:p@a.example.com/x",
    });
  });

  it("lets the file replace values already set, so both URLs switch together", () => {
    const path = join(dir, ".env.fake");
    writeFileSync(path, "COUCH_DB_ENV=test\n");
    const target: Record<string, string | undefined> = {
      COUCH_DB_ENV: "prod",
      UNRELATED: "kept",
    };
    loadEnvFile(path, target);
    expect(target).toEqual({ COUCH_DB_ENV: "test", UNRELATED: "kept" });
  });

  it("reads CRLF files without trailing carriage returns", () => {
    const path = join(dir, ".env.fake");
    writeFileSync(path, "COUCH_DB_ENV=dev\r\nDIRECT_URL=postgresql://u:p@a.example.com/x\r\n");
    const target: Record<string, string | undefined> = {};
    loadEnvFile(path, target);
    expect(target).toEqual({
      COUCH_DB_ENV: "dev",
      DIRECT_URL: "postgresql://u:p@a.example.com/x",
    });
  });

  it("leaves the target alone when the file does not exist", () => {
    const target: Record<string, string | undefined> = { COUCH_DB_ENV: "prod" };
    expect(loadEnvFile(join(dir, "missing"), target)).toBe(false);
    expect(target).toEqual({ COUCH_DB_ENV: "prod" });
  });
});
