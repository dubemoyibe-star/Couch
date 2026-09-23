"use server";

import { redirect } from "next/navigation";
import { getPrismaClient, setCurrentMedia } from "@couch/database";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { mapToUserMessage } from "@/lib/repo-error-messages";

export type SetCurrentMediaState = {
  readonly error: string | null;
};

export type SetCurrentMediaDeps = {
  readonly getCurrentUser: () => Promise<CurrentUser | null>;
  readonly setCurrentMedia: typeof setCurrentMedia;
};

/**
 * The action's logic, separated from the `"use server"` export below so a
 * test can call it with a stubbed `getCurrentUser` (for example one that
 * returns null) without going through Next's server action machinery or a
 * page-level redirect.
 *
 * Independently re-checks the session here rather than trusting the caller:
 * a page-level redirect for an unauthenticated visitor is not a substitute
 * for this check, since the action can be invoked directly. Host status is
 * also not trusted from the client: `setCurrentMedia` itself re-checks the
 * acting user's membership role and returns `forbidden` for a non-host.
 *
 * An empty or missing `mediaId` field clears the couch's current media,
 * which is how the "stop watching" control works: it submits the same form
 * with no `mediaId` field set.
 */
export async function runSetCurrentMediaAction(
  _prevState: SetCurrentMediaState,
  formData: FormData,
  deps: SetCurrentMediaDeps,
): Promise<SetCurrentMediaState> {
  const user = await deps.getCurrentUser();
  if (!user) return { error: "You must be signed in to do that." };

  const couchId = formData.get("couchId");
  if (typeof couchId !== "string" || couchId.length === 0) {
    return { error: "Something went wrong. Please try again." };
  }

  const rawMediaId = formData.get("mediaId");
  const mediaId = typeof rawMediaId === "string" && rawMediaId.length > 0 ? rawMediaId : null;

  const db = getPrismaClient();
  const result = await deps.setCurrentMedia(db, { couchId, actingUserId: user.id, mediaId });
  if (!result.ok) return { error: mapToUserMessage(result.error) };

  redirect(`/couch/${couchId}`);
}

export async function setCurrentMediaAction(
  prevState: SetCurrentMediaState,
  formData: FormData,
): Promise<SetCurrentMediaState> {
  return runSetCurrentMediaAction(prevState, formData, { getCurrentUser, setCurrentMedia });
}
