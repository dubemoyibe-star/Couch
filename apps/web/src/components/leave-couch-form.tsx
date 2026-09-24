"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
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
  const [state, formAction, pending] = useActionState(leaveCouchAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="couchId" value={couchId} />
      <Button type="submit" variant="secondary" loading={pending} loadingLabel="Leaving…" className="min-h-10 px-4">
        Leave this couch
      </Button>
      <FormError message={state.error} compact />
    </form>
  );
}
