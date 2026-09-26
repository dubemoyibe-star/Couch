"use server";

import { redirect } from "next/navigation";
import { couchNameSchema } from "@couch/contracts";
import { createCouch, getPrismaClient } from "@couch/database";
import { couchNameErrorMessage } from "@/lib/couch-name-error";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { mapToUserMessage } from "@/lib/repo-error-messages";

export type CreateCouchState = {
  readonly error: string | null;
};

export type CreateCouchDeps = {
  readonly getCurrentUser: () => Promise<CurrentUser | null>;
  readonly createCouch: typeof createCouch;
};

/**
 * The action's logic, separated from the `"use server"` export below so a
 * test can call it with a stubbed `getCurrentUser` (for example one that
 * returns null) without going through Next's server action machinery or a
 * page-level redirect.
 *
 * Independently re-checks the session here rather than trusting the caller,
 * per the defense-in-depth rule from Issue 2: a page-level redirect for an
 * unauthenticated visitor is not a substitute for this check, since the
 * action can be invoked directly.
 */
export async function runCreateCouchAction(
  _prevState: CreateCouchState,
  formData: FormData,
  deps: CreateCouchDeps,
): Promise<CreateCouchState> {
  const user = await deps.getCurrentUser();
  if (!user) return { error: "You must be signed in to create a couch." };

  const parsed = couchNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { error: couchNameErrorMessage(parsed.error.issues[0]) };
  }

  // Only an explicit "public" makes the couch public; a missing or unknown
  // value stays private.
  const isPublic = formData.get("visibility") === "public";

  let couchId: string;
  try {
    const db = getPrismaClient();
    const { couch } = await deps.createCouch(db, { ownerId: user.id, name: parsed.data, isPublic });
    couchId = couch.id;
  } catch {
    return { error: mapToUserMessage("create_couch_failed") };
  }

  redirect(`/couch/${couchId}`);
}

export async function createCouchAction(
  prevState: CreateCouchState,
  formData: FormData,
): Promise<CreateCouchState> {
  return runCreateCouchAction(prevState, formData, { getCurrentUser, createCouch });
}
