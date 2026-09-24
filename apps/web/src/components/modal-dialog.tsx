"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";

/**
 * A native modal dialog for intercepted routes: focus trapping, Escape to
 * close and an inert page behind it come from the browser. Closing (Escape,
 * the X or a click outside) goes back one history entry, so the page
 * underneath is exactly where the visitor was.
 */
export function ModalDialog({
  labelledBy,
  className,
  children,
}: {
  readonly labelledBy: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={() => router.back()}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
      className={cx(
        "relative m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-md border border-border bg-surface text-text backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => ref.current?.close()}
        className={cx(
          "absolute right-3 top-3 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full text-text-muted hover:bg-danger/10 hover:text-danger active:bg-danger/15 active:text-danger",
          calmTransition,
          focusRing,
        )}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
      {children}
    </dialog>
  );
}
