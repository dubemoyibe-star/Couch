"use client";

import { Armchair } from "lucide-react";
import { ModalDialog } from "@/components/modal-dialog";
import { CreateCouchForm } from "@/app/(app)/couch/create/create-couch-form";
import type { DefaultVisibility } from "@/lib/default-visibility";

/** The create-couch form in a modal, opened over the page the visitor was on. */
export function CreateCouchDialog({ defaultVisibility }: { readonly defaultVisibility?: DefaultVisibility }) {
  return (
    <ModalDialog labelledBy="create-couch-title" className="p-6 sm:p-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full border border-border bg-surface-muted text-primary"
          >
            <Armchair className="size-6" />
          </span>
          <h1 id="create-couch-title" className="font-display text-2xl font-semibold text-text">
            Create a couch
          </h1>
          <p className="text-sm text-text-muted">Give it a name, then invite friends with a link.</p>
        </div>
        <CreateCouchForm autoFocus defaultVisibility={defaultVisibility} />
      </div>
    </ModalDialog>
  );
}
