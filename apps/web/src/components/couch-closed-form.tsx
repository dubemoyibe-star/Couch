"use client";

import { useActionState, useRef } from "react";
import { DoorClosed, DoorOpen } from "lucide-react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { setCouchClosedAction, type SetCouchClosedState } from "@/app/(app)/couch/[id]/actions";

const initialState: SetCouchClosedState = { error: null };

/**
 * A host-only control that closes a couch to new members or reopens it.
 * Existing members are unaffected either way. The button only opens a
 * confirmation; nothing is submitted until the host confirms in the dialog.
 * The page keys this component on the current state, so it remounts (and the
 * dialog closes) once a change lands.
 */
export function CouchClosedForm({ couchId, isClosed }: { readonly couchId: string; readonly isClosed: boolean }) {
  const [state, formAction, pending] = useActionState(setCouchClosedAction, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const Icon = isClosed ? DoorClosed : DoorOpen;
  const ActionIcon = isClosed ? DoorOpen : DoorClosed;
  const nextLabel = isClosed ? "Reopen couch" : "Close couch";

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="couchId" value={couchId} />
      <input type="hidden" name="isClosed" value={isClosed ? "false" : "true"} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-start gap-3">
          <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-muted" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text">{isClosed ? "Closed to new members" : "Open to new members"}</span>
            <span className="text-sm text-text-muted">
              {isClosed ? "Nobody new can join until you reopen it." : "Anyone with access can still join."}
            </span>
          </div>
        </div>
        <Button type="button" variant="secondary" className="min-h-10 px-4" onClick={() => dialogRef.current?.showModal()}>
          <ActionIcon aria-hidden="true" className="size-4" />
          {nextLabel}
        </Button>
      </div>
      <dialog
        ref={dialogRef}
        aria-labelledby="closed-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-md border border-border bg-surface p-6 text-text backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id="closed-title" className="font-display text-xl font-semibold">
              {isClosed ? "Reopen this couch?" : "Close this couch?"}
            </h2>
            <p className="text-sm text-text-muted">
              {isClosed
                ? "New people will be able to join again, and a public couch will be listed again."
                : "Nobody new will be able to join, and a public couch will be hidden from Find a couch. Current members stay. You can reopen it at any time."}
            </p>
          </div>
          <FormError message={state.error} compact />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" className="min-h-10 px-4" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} loadingLabel="Saving…" className="min-h-10 px-4">
              {nextLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </form>
  );
}
