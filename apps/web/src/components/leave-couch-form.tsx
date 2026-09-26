"use client";

import { useActionState, useRef } from "react";
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

/**
 * A non-host control that leaves a couch. The button only opens a
 * confirmation; nothing is submitted until the member confirms in the dialog.
 * Redirects to the dashboard on success.
 */
export function LeaveCouchForm({ couchId }: LeaveCouchFormProps) {
  const [state, formAction, pending] = useActionState(leaveCouchAction, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="couchId" value={couchId} />
      <Button variant="secondary" onClick={() => dialogRef.current?.showModal()} className="min-h-10 px-4">
        Leave this couch
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="leave-couch-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-md border border-border bg-surface p-6 text-text backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id="leave-couch-title" className="font-display text-xl font-semibold">
              Leave this couch?
            </h2>
            <p className="text-sm text-text-muted">
              You will lose access to it. You can rejoin later with an invite link, or from Find a couch if it is public.
            </p>
          </div>
          <FormError message={state.error} compact />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" className="min-h-10 px-4" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending} loadingLabel="Leaving…" className="min-h-10 px-4">
              Leave
            </Button>
          </div>
        </div>
      </dialog>
    </form>
  );
}
