import { describe, expect, it } from "vitest";
import { greetingFor } from "./greeting";

describe("greetingFor", () => {
  it.each([
    [5, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [17, "Good afternoon"],
    [18, "Good evening"],
    [23, "Good evening"],
    [0, "Good evening"],
    [4, "Good evening"],
  ])("hour %i is %s", (hour, expected) => {
    expect(greetingFor(hour)).toBe(expected);
  });
});
