import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
  it("maps a known Better Auth error code to a clear message", () => {
    const error = new APIError("UNAUTHORIZED", {
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    });
    expect(authErrorMessage(error)).toBe("That email or password is not correct.");
  });

  it("maps USER_NOT_FOUND to the same message as a wrong password", () => {
    const error = new APIError("UNAUTHORIZED", {
      code: "USER_NOT_FOUND",
      message: "User not found",
    });
    expect(authErrorMessage(error)).toBe("That email or password is not correct.");
  });

  it("maps a duplicate sign-up error", () => {
    const error = new APIError("UNPROCESSABLE_ENTITY", {
      code: "USER_ALREADY_EXISTS",
      message: "User already exists.",
    });
    expect(authErrorMessage(error)).toBe("An account with that email already exists.");
  });

  it("falls back to a generic message for an unrecognized error code", () => {
    const error = new APIError("BAD_REQUEST", {
      code: "SOME_FUTURE_CODE",
      message: "Something new",
    });
    expect(authErrorMessage(error)).toBe("Something went wrong. Please try again.");
  });

  it("falls back to a generic message for a non-APIError value", () => {
    expect(authErrorMessage(new Error("network down"))).toBe(
      "Something went wrong. Please try again.",
    );
    expect(authErrorMessage("plain string")).toBe("Something went wrong. Please try again.");
  });
});
