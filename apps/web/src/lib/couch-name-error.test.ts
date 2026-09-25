import { COUCH_NAME_MAX_LENGTH, couchNameSchema } from "@couch/contracts";
import { describe, expect, it } from "vitest";
import { couchNameErrorMessage } from "./couch-name-error";

function messageFor(name: string): string | null {
  const parsed = couchNameSchema.safeParse(name);
  return parsed.success ? null : couchNameErrorMessage(parsed.error.issues[0]);
}

describe("couchNameErrorMessage", () => {
  it("asks for a name when it is empty or only whitespace", () => {
    expect(messageFor("")).toBe("Enter a name for your couch.");
    expect(messageFor("   ")).toBe("Enter a name for your couch.");
  });

  it("states the limit when the name is too long", () => {
    expect(messageFor("a".repeat(COUCH_NAME_MAX_LENGTH + 1))).toBe(
      `Couch names can be at most ${COUCH_NAME_MAX_LENGTH} characters. Shorten it.`,
    );
  });

  it("explains a control character rejection", () => {
    expect(messageFor("Movie\nnight")).toBe("Couch names cannot contain line breaks or other control characters.");
  });

  it("falls back to a generic message for an unknown issue", () => {
    expect(couchNameErrorMessage(undefined)).toBe("That couch name is not valid. Try a different one.");
    expect(couchNameErrorMessage({ code: "invalid_type" })).toBe("That couch name is not valid. Try a different one.");
  });

  it("returns nothing for a valid name", () => {
    expect(messageFor("Friday Night")).toBeNull();
  });
});
