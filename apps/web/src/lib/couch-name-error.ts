import { COUCH_NAME_MAX_LENGTH } from "@couch/contracts";

/**
 * Plain-language message for a couch name that failed `couchNameSchema`, keyed by the
 * schema issue code. The schema's own messages are validation jargon ("Too small: expected
 * string to have >=1 characters") that a visitor cannot act on.
 */
export function couchNameErrorMessage(issue: { readonly code: string } | undefined): string {
  switch (issue?.code) {
    case "too_small":
      return "Enter a name for your couch.";
    case "too_big":
      return `Couch names can be at most ${COUCH_NAME_MAX_LENGTH} characters. Shorten it.`;
    case "custom":
      return "Couch names cannot contain line breaks or other control characters.";
    default:
      return "That couch name is not valid. Try a different one.";
  }
}
