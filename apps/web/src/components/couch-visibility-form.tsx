"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import {
  setCouchVisibilityAction,
  type SetCouchVisibilityState,
} from "@/app/(app)/couch/[id]/actions";

const initialState: SetCouchVisibilityState = { error: null };

type CouchVisibilityFormProps = {
  readonly couchId: string;
  readonly isPublic: boolean;
};

/** A host-only control that switches a couch between public and private. */
export function CouchVisibilityForm({ couchId, isPublic }: CouchVisibilityFormProps) {
  const [state, formAction, pending] = useActionState(setCouchVisibilityAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="couchId" value={couchId} />
      <input type="hidden" name="isPublic" value={isPublic ? "false" : "true"} />
      <p className="text-sm text-text-muted">
        {isPublic
          ? "This couch is public: anyone can find and join it."
          : "This couch is private: only people with the invite link can join."}
      </p>
      <Button type="submit" variant="secondary" loading={pending} loadingLabel="Saving…" className="min-h-10 px-4">
        {isPublic ? "Make private" : "Make public"}
      </Button>
      <FormError message={state.error} compact />
    </form>
  );
}
