"use client";

import { useActionState, useRef } from "react";
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
  /** When set, the button opens this confirmation and nothing is submitted until it is confirmed. */
  readonly confirm?: {
    readonly title: string;
    readonly description: string;
    readonly confirmLabel: string;
  };
};

/**
 * A host-only control that sets or clears a couch's current media. Used both
 * from the couch page (to clear) and from the catalog (to set a searched
 * item), so the one form and the one server action back both flows.
 */
export function SetCurrentMediaForm({ couchId, mediaId, children, variant, confirm }: SetCurrentMediaFormProps) {
  const [state, formAction, pending] = useActionState(setCurrentMediaAction, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <form action={formAction} className="flex flex-col">
      <input type="hidden" name="couchId" value={couchId} />
      {mediaId ? <input type="hidden" name="mediaId" value={mediaId} /> : null}
      {confirm ? (
        <Button type="button" variant={variant} className="self-start" onClick={() => dialogRef.current?.showModal()}>
          {children}
        </Button>
      ) : (
        <Button type="submit" variant={variant} loading={pending} loadingLabel="Saving…" className="self-start">
          {children}
        </Button>
      )}
      {confirm ? (
        <dialog
          ref={dialogRef}
          aria-labelledby="set-media-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) dialogRef.current?.close();
          }}
          className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-md border border-border bg-surface p-6 text-text backdrop:bg-black/60 backdrop:backdrop-blur-sm"
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 id="set-media-title" className="font-display text-xl font-semibold">
                {confirm.title}
              </h2>
              <p className="text-sm text-text-muted">{confirm.description}</p>
            </div>
            <FormError message={state.error} compact />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" className="min-h-10 px-4" onClick={() => dialogRef.current?.close()}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} loadingLabel="Saving…" className="min-h-10 px-4">
                {confirm.confirmLabel}
              </Button>
            </div>
          </div>
        </dialog>
      ) : (
        <FormError message={state.error} compact />
      )}
    </form>
  );
}
