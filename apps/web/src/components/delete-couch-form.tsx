"use client";

import { useActionState, useRef } from "react";
import { Trash2 } from "lucide-react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import {
  deleteCouchAction,
  type DeleteCouchState,
} from "@/app/(app)/couch/[id]/actions";

const initialState: DeleteCouchState = { error: null };

type DeleteCouchFormProps = {
  readonly couchId: string;
  readonly couchName: string;
};

/**
 * A host-only control that permanently deletes a couch. The button only opens
 * a confirmation; nothing is submitted until the host confirms in the dialog.
 * Redirects to the dashboard on success.
 */
export function DeleteCouchForm({ couchId, couchName }: DeleteCouchFormProps) {
  const [state, formAction, pending] = useActionState(deleteCouchAction, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="couchId" value={couchId} />
      <Button
        variant="secondary"
        onClick={() => dialogRef.current?.showModal()}
        className="min-h-10 px-4 hover:border-danger! hover:bg-danger/10! active:bg-danger/15!"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Delete this couch
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="delete-couch-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-md border border-border bg-surface p-6 text-text backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id="delete-couch-title" className="break-words font-display text-xl font-semibold">
              Delete {couchName}?
            </h2>
            <p className="text-sm text-text-muted">
              This permanently deletes the couch and its members. Everyone currently in it is disconnected, and this
              cannot be undone. The media you picked is not affected, because it belongs to the shared catalog, not to
              the couch.
            </p>
          </div>
          <FormError message={state.error} compact />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" className="min-h-10 px-4" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending} loadingLabel="Deleting…" className="min-h-10 px-4">
              Delete couch
            </Button>
          </div>
        </div>
      </dialog>
    </form>
  );
}
