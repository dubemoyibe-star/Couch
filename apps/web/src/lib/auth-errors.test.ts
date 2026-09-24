import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  isEmailNotVerifiedError,
  resetLinkErrorMessage,
  resetPasswordErrorMessage,
  verifyLinkErrorMessage,
} from "./auth-errors";

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

  it("maps EMAIL_NOT_VERIFIED to a specific message, not the generic one", () => {
    const error = new APIError("FORBIDDEN", {
      code: "EMAIL_NOT_VERIFIED",
      message: "Email not verified",
    });
    expect(authErrorMessage(error)).toBe(
      "Verify your email address before signing in. Check your inbox for the link.",
    );
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

describe("isEmailNotVerifiedError", () => {
  it("is true only for the EMAIL_NOT_VERIFIED code", () => {
    const unverified = new APIError("FORBIDDEN", { code: "EMAIL_NOT_VERIFIED", message: "x" });
    const wrongPassword = new APIError("UNAUTHORIZED", { code: "INVALID_EMAIL_OR_PASSWORD", message: "x" });
    expect(isEmailNotVerifiedError(unverified)).toBe(true);
    expect(isEmailNotVerifiedError(wrongPassword)).toBe(false);
    expect(isEmailNotVerifiedError(new Error("EMAIL_NOT_VERIFIED"))).toBe(false);
  });
});

describe("verifyLinkErrorMessage", () => {
  it("returns null when there is no error", () => {
    expect(verifyLinkErrorMessage(undefined)).toBeNull();
  });

  it("distinguishes an expired link from an invalid one", () => {
    expect(verifyLinkErrorMessage("TOKEN_EXPIRED")).toBe("This verification link has expired.");
    expect(verifyLinkErrorMessage("INVALID_TOKEN")).toBe("This verification link is not valid.");
  });

  it("falls back for an unknown code", () => {
    expect(verifyLinkErrorMessage("SOMETHING_ELSE")).toBe("This verification link could not be used.");
  });
});

describe("password reset messages", () => {
  it("tells the visitor an INVALID_TOKEN reset link expired or was already used", () => {
    expect(resetLinkErrorMessage("INVALID_TOKEN")).toBe("This reset link has expired or was already used.");
    expect(resetPasswordErrorMessage("INVALID_TOKEN")).toBe("This reset link has expired or was already used.");
  });

  it("returns null for a reset link with no error, and a generic message for an unknown one", () => {
    expect(resetLinkErrorMessage(undefined)).toBeNull();
    expect(resetLinkErrorMessage("SOMETHING_ELSE")).toBe("This reset link could not be used.");
  });

  it("maps password length errors and falls back for anything else", () => {
    expect(resetPasswordErrorMessage("PASSWORD_TOO_SHORT")).toBe("That password is too short.");
    expect(resetPasswordErrorMessage("PASSWORD_TOO_LONG")).toBe("That password is too long.");
    expect(resetPasswordErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
  });
});
