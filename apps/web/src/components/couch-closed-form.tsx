"use client";

import { useActionState } from "react";
import { DoorClosed, DoorOpen } from "lucide-react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { setCouchClosedAction, type SetCouchClosedState } from "@/app/(app)/couch/[id]/actions";

const initialState: SetCouchClosedState = { error: null };

/**
 * A host-only control that closes a couch to new members or reopens it.
 * Existing members are unaffected either way.
 */
export function CouchClosedForm({ couchId, isClosed }: { readonly couchId: string; readonly isClosed: boolean }) {
  const [state, formAction, pending] = useActionState(setCouchClosedAction, initialState);
  const Icon = isClosed ? DoorClosed : DoorOpen;

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
              {isClosed ? "Nobody new can join until you reopen it." : "Close it to stop new people joining. Current members stay."}
            </span>
          </div>
        </div>
        <Button type="submit" variant="secondary" loading={pending} loadingLabel="Saving…" className="min-h-10 px-4">
          {isClosed ? "Reopen couch" : "Close couch"}
        </Button>
      </div>
      <FormError message={state.error} compact />
    </form>
  );
}
