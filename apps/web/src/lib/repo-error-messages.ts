/**
 * Maps a repository result's error kind, as returned by `@couch/database`'s
 * Couch, CouchMember and catalog functions, to a message safe to show a
 * user. This is a different vocabulary from Better Auth's own error codes
 * (see `auth-errors.ts`), so the two mappers stay separate rather than
 * merging into one.
 *
 * An error kind this map does not recognize, including one added to
 * `@couch/database` later, falls back to a generic message instead of a
 * blank screen or a raw code.
 */
const REPO_ERROR_MESSAGES: Record<string, string> = {
  couch_not_found: "That couch could not be found.",
  couch_full: "This couch is full.",
  not_a_member: "You are not a member of this couch.",
  host_cannot_leave: "As the host, you cannot leave this couch.",
  forbidden: "You do not have permission to do that.",
  cannot_remove_self: "You cannot remove yourself from the couch.",
  media_unavailable: "That media is not available right now.",
};

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

export function mapToUserMessage(errorKind: string): string {
  return REPO_ERROR_MESSAGES[errorKind] ?? DEFAULT_MESSAGE;
}
