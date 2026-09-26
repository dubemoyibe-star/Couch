"use client";

import { useActionState, useRef } from "react";
import { UserMinus } from "lucide-react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import {
  removeMemberAction,
  type RemoveMemberState,
} from "@/app/(app)/couch/[id]/actions";

const initialState: RemoveMemberState = { error: null };

type RemoveMemberFormProps = {
  readonly couchId: string;
  readonly targetUserId: string;
  readonly memberName: string;
};

/**
 * A host-only control that removes a non-host member from a couch. The
 * button only opens a confirmation; nothing is submitted until the host
 * confirms in the dialog.
 */
export function RemoveMemberForm({ couchId, targetUserId, memberName }: RemoveMemberFormProps) {
  const [state, formAction, pending] = useActionState(removeMemberAction, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <form action={formAction}>
      <input type="hidden" name="couchId" value={couchId} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <button
        type="button"
        aria-label={`Remove ${memberName}`}
        onClick={() => dialogRef.current?.showModal()}
        className={cx(
          "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-text hover:border-danger hover:bg-danger/10 active:bg-danger/15",
          calmTransition,
          focusRing,
        )}
      >
        <UserMinus aria-hidden="true" className="size-3.5" />
        Remove
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`remove-${targetUserId}-title`}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-md border border-border bg-surface p-6 text-text backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id={`remove-${targetUserId}-title`} className="break-words font-display text-xl font-semibold">
              Remove {memberName}?
            </h2>
            <p className="text-sm text-text-muted">
              They will lose access to this couch. They can rejoin later with the invite link.
            </p>
          </div>
          <FormError message={state.error} compact />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              className="min-h-10 px-4"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending} loadingLabel="Removing…" className="min-h-10 px-4">
              Remove
            </Button>
          </div>
        </div>
      </dialog>
    </form>
  );
}
