"use server";

import { redirect } from "next/navigation";
import { getCouchByInviteCode, getPrismaClient, joinCouch } from "@couch/database";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { mapToUserMessage } from "@/lib/repo-error-messages";

export type JoinCouchState = {
  readonly error: string | null;
};

export type JoinCouchDeps = {
  readonly getCurrentUser: () => Promise<CurrentUser | null>;
  readonly getCouchByInviteCode: typeof getCouchByInviteCode;
  readonly joinCouch: typeof joinCouch;
};

/**
 * The action's logic, separated from the `"use server"` export below so a
 * test can call it with a stubbed `getCurrentUser` (for example one that
 * returns null) without going through Next's server action machinery or a
 * page-level redirect.
 *
 * Independently re-checks the session here rather than trusting the caller:
 * a page-level redirect for an unauthenticated visitor is not a substitute
 * for this check, since the action can be invoked directly.
 *
 * The couch to join is resolved again here from the invite code, rather than
 * trusting a couch id the client could supply, since identity of the target
 * couch is external input and must be validated at this boundary too.
 */
export async function runJoinCouchAction(
  _prevState: JoinCouchState,
  formData: FormData,
  deps: JoinCouchDeps,
): Promise<JoinCouchState> {
  const user = await deps.getCurrentUser();
  if (!user) return { error: "You must be signed in to join a couch." };

  const inviteCode = formData.get("inviteCode");
  if (typeof inviteCode !== "string" || inviteCode.length === 0) {
    return { error: "This invite link is not valid." };
  }

  const db = getPrismaClient();
  const couch = await deps.getCouchByInviteCode(db, inviteCode);
  if (!couch) return { error: "This invite link is not valid." };

  const result = await deps.joinCouch(db, { couchId: couch.id, userId: user.id });
  if (!result.ok) return { error: mapToUserMessage(result.error) };

  redirect(`/couch/${couch.id}`);
}

export async function joinCouchAction(
  prevState: JoinCouchState,
  formData: FormData,
): Promise<JoinCouchState> {
  return runJoinCouchAction(prevState, formData, {
    getCurrentUser,
    getCouchByInviteCode,
    joinCouch,
  });
}
