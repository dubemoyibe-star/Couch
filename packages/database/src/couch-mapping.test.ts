import { describe, expect, it } from "vitest";
import { toContractRole, toDbRole } from "./couch-mapping";

describe("role mapping", () => {
  it("maps the database role enum to the lowercase contract role", () => {
    expect(toContractRole("HOST")).toBe("host");
    expect(toContractRole("PARTICIPANT")).toBe("participant");
  });

  it("maps the contract role back to the database role enum", () => {
    expect(toDbRole("host")).toBe("HOST");
    expect(toDbRole("participant")).toBe("PARTICIPANT");
  });

  it("round-trips both directions", () => {
    for (const role of ["host", "participant"] as const) {
      expect(toContractRole(toDbRole(role))).toBe(role);
    }
  });
});
