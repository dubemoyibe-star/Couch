"use server";

import { redirect } from "next/navigation";
import { getCouch, getPrismaClient, joinCouch } from "@couch/database";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { mapToUserMessage } from "@/lib/repo-error-messages";

export type JoinPublicCouchState = {
  readonly error: string | null;
};

export type JoinPublicCouchDeps = {
  readonly getCurrentUser: () => Promise<CurrentUser | null>;
  readonly getCouch: typeof getCouch;
  readonly joinCouch: typeof joinCouch;
};

/**
 * Joins a public couch by id. Separated from the `"use server"` export below
 * so a test can stub `getCurrentUser` without Next's action machinery.
 *
 * The session is re-checked here, since the action can be invoked directly.
 * `joinCouch` does not look at visibility, so this action must: without the
 * `isPublic` check, any couch id would be joinable and the invite code would
 * stop being the gate for private couches. A private or unknown id gets the
 * same answer, so it does not reveal whether a private couch exists.
 */
export async function runJoinPublicCouchAction(
  _prevState: JoinPublicCouchState,
  formData: FormData,
  deps: JoinPublicCouchDeps,
): Promise<JoinPublicCouchState> {
  const user = await deps.getCurrentUser();
  if (!user) return { error: "You must be signed in to join a couch." };

  const couchId = formData.get("couchId");
  if (typeof couchId !== "string" || couchId.length === 0) {
    return { error: mapToUserMessage("couch_not_found") };
  }

  const db = getPrismaClient();
  const couch = await deps.getCouch(db, couchId);
  if (!couch || !couch.isPublic) return { error: mapToUserMessage("couch_not_found") };

  const result = await deps.joinCouch(db, { couchId: couch.id, userId: user.id });
  if (!result.ok) return { error: mapToUserMessage(result.error) };

  redirect(`/couch/${couch.id}`);
}

export async function joinPublicCouchAction(
  prevState: JoinPublicCouchState,
  formData: FormData,
): Promise<JoinPublicCouchState> {
  return runJoinPublicCouchAction(prevState, formData, { getCurrentUser, getCouch, joinCouch });
}
