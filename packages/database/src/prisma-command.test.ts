import { describe, expect, it } from "vitest";
import { classifyPrismaCommand } from "./prisma-command";

const argv = (...args: string[]) => ["node", "prisma", ...args];

describe("classifyPrismaCommand", () => {
  it.each([
    [["generate"]],
    [["validate"]],
    [["format"]],
    [["version"]],
    [["--version"]],
    [[]],
    [["migrate", "reset", "--help"]],
    [["migrate", "dev", "-h"]],
    [["generate", "--config", "prisma.test.config.ts"]],
  ])("treats %j as offline", (args) => {
    expect(classifyPrismaCommand(argv(...args))).toBeNull();
  });

  it("treats migrate deploy as deploy", () => {
    expect(classifyPrismaCommand(argv("migrate", "deploy"))).toBe("deploy");
    expect(
      classifyPrismaCommand(argv("migrate", "deploy", "--config", "prisma.test.config.ts")),
    ).toBe("deploy");
    expect(classifyPrismaCommand(argv("--config", "x.ts", "migrate", "deploy"))).toBe(
      "deploy",
    );
  });

  it.each([
    [["migrate", "reset"]],
    [["migrate", "reset", "--force"]],
    [["migrate", "dev"]],
    [["migrate", "status"]],
    [["migrate", "resolve", "--applied", "x"]],
    [["db", "push"]],
    [["db", "execute"]],
    [["studio"]],
    [["something-new"]],
    [["--config", "x.ts", "migrate", "reset"]],
  ])("treats %j as destructive", (args) => {
    expect(classifyPrismaCommand(argv(...args))).toBe("destructive");
  });
});
