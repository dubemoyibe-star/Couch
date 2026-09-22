import { describe, expect, it } from "vitest";
import { mapToUserMessage } from "./repo-error-messages";

describe("mapToUserMessage", () => {
  it("maps couch_not_found", () => {
    expect(mapToUserMessage("couch_not_found")).toBe("That couch could not be found.");
  });

  it("maps couch_full", () => {
    expect(mapToUserMessage("couch_full")).toBe("This couch is full.");
  });

  it("maps not_a_member", () => {
    expect(mapToUserMessage("not_a_member")).toBe("You are not a member of this couch.");
  });

  it("maps host_cannot_leave", () => {
    expect(mapToUserMessage("host_cannot_leave")).toBe(
      "As the host, you cannot leave this couch.",
    );
  });

  it("maps forbidden", () => {
    expect(mapToUserMessage("forbidden")).toBe("You do not have permission to do that.");
  });

  it("maps cannot_remove_self", () => {
    expect(mapToUserMessage("cannot_remove_self")).toBe(
      "You cannot remove yourself from the couch.",
    );
  });

  it("maps media_unavailable", () => {
    expect(mapToUserMessage("media_unavailable")).toBe(
      "That media is not available right now.",
    );
  });

  it("falls back to a generic message for an unrecognized error kind", () => {
    expect(mapToUserMessage("some_future_kind")).toBe("Something went wrong. Please try again.");
  });
});
