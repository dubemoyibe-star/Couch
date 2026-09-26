"use server";

import { redirect } from "next/navigation";
import { deleteCouch, getPrismaClient, leaveCouch, removeMember, setCouchClosed, setCouchVisibility, setCurrentMedia } from "@couch/database";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { mapToUserMessage } from "@/lib/repo-error-messages";
import { requestRealtimeTeardown, type TeardownResult } from "@/lib/realtime-teardown";

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

export type RemoveMemberState = {
  readonly error: string | null;
};

export type RemoveMemberDeps = {
  readonly getCurrentUser: () => Promise<CurrentUser | null>;
  readonly removeMember: typeof removeMember;
};

/**
 * Same pattern as `runSetCurrentMediaAction`: the session is re-checked here
 * rather than trusted from the page, since the action can be invoked
 * directly. Host status is not trusted from the client either: `removeMember`
 * itself re-checks the acting user's role and refuses a non-host with
 * `forbidden`, and refuses the host removing themselves with
 * `cannot_remove_self`.
 */
export async function runRemoveMemberAction(
  _prevState: RemoveMemberState,
  formData: FormData,
  deps: RemoveMemberDeps,
): Promise<RemoveMemberState> {
  const user = await deps.getCurrentUser();
  if (!user) return { error: "You must be signed in to do that." };

  const couchId = formData.get("couchId");
  const targetUserId = formData.get("targetUserId");
  if (
    typeof couchId !== "string" ||
    couchId.length === 0 ||
    typeof targetUserId !== "string" ||
    targetUserId.length === 0
  ) {
    return { error: "Something went wrong. Please try again." };
  }

  const db = getPrismaClient();
  const result = await deps.removeMember(db, { couchId, actingUserId: user.id, targetUserId });
  if (!result.ok) return { error: mapToUserMessage(result.error) };

  redirect(`/couch/${couchId}`);
}

export async function removeMemberAction(
  prevState: RemoveMemberState,
  formData: FormData,
): Promise<RemoveMemberState> {
  return runRemoveMemberAction(prevState, formData, { getCurrentUser, removeMember });
}

export type LeaveCouchState = {
  readonly error: string | null;
};

export type LeaveCouchDeps = {
  readonly getCurrentUser: () => Promise<CurrentUser | null>;
  readonly leaveCouch: typeof leaveCouch;
};

/**
 * Same defense-in-depth pattern as the actions above. `leaveCouch` itself
 * refuses the host with `host_cannot_leave`, so a host invoking this action
 * directly still gets a mapped error rather than being removed.
 */
export async function runLeaveCouchAction(
  _prevState: LeaveCouchState,
  formData: FormData,
  deps: LeaveCouchDeps,
): Promise<LeaveCouchState> {
  const user = await deps.getCurrentUser();
  if (!user) return { error: "You must be signed in to do that." };

  const couchId = formData.get("couchId");
  if (typeof couchId !== "string" || couchId.length === 0) {
    return { error: "Something went wrong. Please try again." };
  }

  const db = getPrismaClient();
  const result = await deps.leaveCouch(db, { couchId, userId: user.id });
  if (!result.ok) return { error: mapToUserMessage(result.error) };

  redirect("/");
}

export async function leaveCouchAction(
  prevState: LeaveCouchState,
  formData: FormData,
): Promise<LeaveCouchState> {
  return runLeaveCouchAction(prevState, formData, { getCurrentUser, leaveCouch });
}

export type SetCouchVisibilityState = {
  readonly error: string | null;
};

export type SetCouchVisibilityDeps = {
  readonly getCurrentUser: () => Promise<CurrentUser | null>;
  readonly setCouchVisibility: typeof setCouchVisibility;
};

/**
 * Same defense-in-depth pattern as the actions above. Host status is not
 * trusted from the client: `setCouchVisibility` re-checks the acting user's
 * role and returns `forbidden` for a non-host. `isPublic` must be exactly
 * "true" or "false".
 */
export async function runSetCouchVisibilityAction(
  _prevState: SetCouchVisibilityState,
  formData: FormData,
  deps: SetCouchVisibilityDeps,
): Promise<SetCouchVisibilityState> {
  const user = await deps.getCurrentUser();
  if (!user) return { error: "You must be signed in to do that." };

  const couchId = formData.get("couchId");
  const rawIsPublic = formData.get("isPublic");
  if (
    typeof couchId !== "string" ||
    couchId.length === 0 ||
    (rawIsPublic !== "true" && rawIsPublic !== "false")
  ) {
    return { error: "Something went wrong. Please try again." };
  }

  const db = getPrismaClient();
  const result = await deps.setCouchVisibility(db, {
    couchId,
    actingUserId: user.id,
    isPublic: rawIsPublic === "true",
  });
  if (!result.ok) return { error: mapToUserMessage(result.error) };

  redirect(`/couch/${couchId}`);
}

export async function setCouchVisibilityAction(
  prevState: SetCouchVisibilityState,
  formData: FormData,
): Promise<SetCouchVisibilityState> {
  return runSetCouchVisibilityAction(prevState, formData, { getCurrentUser, setCouchVisibility });
}

export type SetCouchClosedState = {
  readonly error: string | null;
};

export type SetCouchClosedDeps = {
  readonly getCurrentUser: () => Promise<CurrentUser | null>;
  readonly setCouchClosed: typeof setCouchClosed;
};

/**
 * Same defense-in-depth pattern as the actions above. Host status is not
 * trusted from the client: `setCouchClosed` re-checks the acting user's role
 * and returns `forbidden` for a non-host. `isClosed` must be exactly "true"
 * or "false".
 */
export async function runSetCouchClosedAction(
  _prevState: SetCouchClosedState,
  formData: FormData,
  deps: SetCouchClosedDeps,
): Promise<SetCouchClosedState> {
  const user = await deps.getCurrentUser();
  if (!user) return { error: "You must be signed in to do that." };

  const couchId = formData.get("couchId");
  const rawIsClosed = formData.get("isClosed");
  if (
    typeof couchId !== "string" ||
    couchId.length === 0 ||
    (rawIsClosed !== "true" && rawIsClosed !== "false")
  ) {
    return { error: "Something went wrong. Please try again." };
  }

  const db = getPrismaClient();
  const result = await deps.setCouchClosed(db, {
    couchId,
    actingUserId: user.id,
    isClosed: rawIsClosed === "true",
  });
  if (!result.ok) return { error: mapToUserMessage(result.error) };

  redirect(`/couch/${couchId}`);
}

export async function setCouchClosedAction(
  prevState: SetCouchClosedState,
  formData: FormData,
): Promise<SetCouchClosedState> {
  return runSetCouchClosedAction(prevState, formData, { getCurrentUser, setCouchClosed });
}

export type DeleteCouchState = {
  readonly error: string | null;
};

export type DeleteCouchDeps = {
  readonly getCurrentUser: () => Promise<CurrentUser | null>;
  readonly deleteCouch: typeof deleteCouch;
  readonly requestTeardown: (couchId: string) => Promise<TeardownResult>;
  readonly logError: (message: string) => void;
};

/**
 * Same defense-in-depth pattern as the actions above. The database delete is
 * the source of truth and runs first; `deleteCouch` re-checks the host role.
 * Only after it succeeds is the realtime service asked to end the live room,
 * and that call is best-effort: a failure is logged and never reported as a
 * failed delete, because the couch is already gone.
 */
export async function runDeleteCouchAction(
  _prevState: DeleteCouchState,
  formData: FormData,
  deps: DeleteCouchDeps,
): Promise<DeleteCouchState> {
  const user = await deps.getCurrentUser();
  if (!user) return { error: "You must be signed in to do that." };

  const couchId = formData.get("couchId");
  if (typeof couchId !== "string" || couchId.length === 0) {
    return { error: "Something went wrong. Please try again." };
  }

  const db = getPrismaClient();
  const result = await deps.deleteCouch(db, { couchId, actingUserId: user.id });
  if (!result.ok) return { error: mapToUserMessage(result.error) };

  const teardown = await deps.requestTeardown(couchId);
  if (!teardown.ok) {
    deps.logError(`[realtime] teardown failed for deleted couch ${couchId}: ${teardown.reason}`);
  }

  redirect("/?deleted=1");
}

export async function deleteCouchAction(
  prevState: DeleteCouchState,
  formData: FormData,
): Promise<DeleteCouchState> {
  return runDeleteCouchAction(prevState, formData, {
    getCurrentUser,
    deleteCouch,
    requestTeardown: (couchId) =>
      requestRealtimeTeardown(couchId, {
        url: process.env.REALTIME_INTERNAL_URL,
        secret: process.env.REALTIME_INTERNAL_SECRET,
      }),
    logError: (message) => console.error(message),
  });
}
