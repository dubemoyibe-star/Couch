"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import {
  leaveCouchAction,
  type LeaveCouchState,
} from "@/app/(app)/couch/[id]/actions";

const initialState: LeaveCouchState = { error: null };

type LeaveCouchFormProps = {
  readonly couchId: string;
};

/** A non-host control that leaves a couch. Redirects to the dashboard on success. */
export function LeaveCouchForm({ couchId }: LeaveCouchFormProps) {
  const [state, formAction] = useActionState(leaveCouchAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="couchId" value={couchId} />
      <SubmitButton>Leave this couch</SubmitButton>
      <FormError message={state.error} />
    </form>
  );
}
