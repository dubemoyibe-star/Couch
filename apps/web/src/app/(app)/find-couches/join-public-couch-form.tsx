"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { joinPublicCouchAction, type JoinPublicCouchState } from "./actions";

const initialState: JoinPublicCouchState = { error: null };

export function JoinPublicCouchForm({ couchId }: { readonly couchId: string }) {
  const [state, formAction, pending] = useActionState(joinPublicCouchAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="couchId" value={couchId} />
      <Button type="submit" loading={pending} loadingLabel="Joining…">
        Join couch
      </Button>
      <FormError message={state.error} compact />
    </form>
  );
}
