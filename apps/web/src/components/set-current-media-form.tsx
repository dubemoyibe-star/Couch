"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import {
  setCurrentMediaAction,
  type SetCurrentMediaState,
} from "@/app/(app)/couch/[id]/actions";

const initialState: SetCurrentMediaState = { error: null };

type SetCurrentMediaFormProps = {
  readonly couchId: string;
  /** Omitted to clear the couch's current media. */
  readonly mediaId?: string;
  readonly children: React.ReactNode;
  readonly variant?: "primary" | "secondary";
};

/**
 * A host-only control that sets or clears a couch's current media. Used both
 * from the couch page (to clear) and from the catalog (to set a searched
 * item), so the one form and the one server action back both flows.
 */
export function SetCurrentMediaForm({ couchId, mediaId, children, variant }: SetCurrentMediaFormProps) {
  const [state, formAction, pending] = useActionState(setCurrentMediaAction, initialState);

  return (
    <form action={formAction} className="flex flex-col">
      <input type="hidden" name="couchId" value={couchId} />
      {mediaId ? <input type="hidden" name="mediaId" value={mediaId} /> : null}
      <Button type="submit" variant={variant} loading={pending} className="self-start">
        {children}
      </Button>
      <FormError message={state.error} compact />
    </form>
  );
}
