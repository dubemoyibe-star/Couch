"use client";

import { useActionState, useRef } from "react";
import { Globe, Lock } from "lucide-react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import {
  setCouchVisibilityAction,
  type SetCouchVisibilityState,
} from "@/app/(app)/couch/[id]/actions";

const initialState: SetCouchVisibilityState = { error: null };

type CouchVisibilityFormProps = {
  readonly couchId: string;
  readonly isPublic: boolean;
};

/**
 * A host-only control that switches a couch between public and private. The
 * button only opens a confirmation; nothing is submitted until the host
 * confirms in the dialog. The page keys this component on the current
 * visibility, so it remounts (and the dialog closes) once a change lands.
 */
export function CouchVisibilityForm({ couchId, isPublic }: CouchVisibilityFormProps) {
  const [state, formAction, pending] = useActionState(setCouchVisibilityAction, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const Icon = isPublic ? Globe : Lock;
  const nextLabel = isPublic ? "Make private" : "Make public";

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="couchId" value={couchId} />
      <input type="hidden" name="isPublic" value={isPublic ? "false" : "true"} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-start gap-3">
          <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-muted" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text">{isPublic ? "Public couch" : "Private couch"}</span>
            <span className="text-sm text-text-muted">
              {isPublic ? "Anyone can find and join it." : "Only people with the invite link can join."}
            </span>
          </div>
        </div>
        <Button type="button" variant="secondary" className="min-h-10 px-4" onClick={() => dialogRef.current?.showModal()}>
          {nextLabel}
        </Button>
      </div>
      <dialog
        ref={dialogRef}
        aria-labelledby="visibility-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-md border border-border bg-surface p-6 text-text backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h2 id="visibility-title" className="font-display text-xl font-semibold">
              {isPublic ? "Make this couch private?" : "Make this couch public?"}
            </h2>
            <p className="text-sm text-text-muted">
              {isPublic
                ? "It will no longer be listed, and only people with the invite link can join. Current members stay."
                : "Anyone will be able to find and join it. You can make it private again at any time."}
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
