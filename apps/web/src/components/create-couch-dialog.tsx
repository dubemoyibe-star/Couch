"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Armchair } from "lucide-react";
import { CreateCouchForm } from "@/app/(app)/couch/create/create-couch-form";

/**
 * The create-couch form in a native modal dialog, which gives focus trapping,
 * Escape to close and an inert page behind it. Closing goes back one history
 * entry, so the page underneath is exactly where the visitor was.
 */
export function CreateCouchDialog() {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="create-couch-title"
      onClose={() => router.back()}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-md border border-border bg-surface p-6 text-text backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:p-8"
    >
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
        <CreateCouchForm onCancel={() => ref.current?.close()} />
      </div>
    </dialog>
  );
}
