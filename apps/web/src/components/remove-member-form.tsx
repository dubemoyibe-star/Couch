"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import {
  removeMemberAction,
  type RemoveMemberState,
} from "@/app/(app)/couch/[id]/actions";

const initialState: RemoveMemberState = { error: null };

type RemoveMemberFormProps = {
  readonly couchId: string;
  readonly targetUserId: string;
};

/** A host-only control that removes a non-host member from a couch. */
export function RemoveMemberForm({ couchId, targetUserId }: RemoveMemberFormProps) {
  const [state, formAction] = useActionState(removeMemberAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="couchId" value={couchId} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <SubmitButton>Remove</SubmitButton>
      <FormError message={state.error} />
    </form>
  );
}
