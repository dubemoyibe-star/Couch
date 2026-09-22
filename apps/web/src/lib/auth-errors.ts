import { isAPIError } from "better-auth/api";

/**
 * Messages safe to show a visitor for the auth error codes sign-up and sign-in can raise.
 * `USER_NOT_FOUND` deliberately gets the same wording as a wrong password, so a failed sign-in
 * never reveals whether the email itself is registered.
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email or password is not correct.",
  USER_NOT_FOUND: "That email or password is not correct.",
  USER_ALREADY_EXISTS: "An account with that email already exists.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with that email already exists.",
  INVALID_EMAIL: "Enter a valid email address.",
  PASSWORD_TOO_SHORT: "That password is too short.",
  PASSWORD_TOO_LONG: "That password is too long.",
};

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

/**
 * Maps a thrown Better Auth error to a message for the sign-up and sign-in forms. This is
 * intentionally narrow: it only knows the auth error codes above. A general repository-result
 * to user-message mapping utility, if the app needs one elsewhere, is a separate concern.
 */
export function authErrorMessage(error: unknown): string {
  if (isAPIError(error)) {
    const code = error.body?.code;
    if (typeof code === "string" && code in AUTH_ERROR_MESSAGES) {
      return AUTH_ERROR_MESSAGES[code];
    }
  }
  return DEFAULT_MESSAGE;
}
