"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { joinPublicCouchAction, type JoinPublicCouchState } from "./actions";

const initialState: JoinPublicCouchState = { error: null };

export function JoinPublicCouchForm({ couchId }: { readonly couchId: string }) {
  const [state, formAction, pending] = useActionState(joinPublicCouchAction, initialState);

  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end gap-2">
      <input type="hidden" name="couchId" value={couchId} />
      <Button type="submit" loading={pending} loadingLabel="Joining…" className="min-h-10 whitespace-nowrap px-4">
        Join couch
      </Button>
      {state.error ? (
        <div className="max-w-48 rounded-md bg-black/80 px-2.5 py-1.5 backdrop-blur-sm">
          <FormError message={state.error} compact />
        </div>
      ) : null}
    </form>
  );
}
