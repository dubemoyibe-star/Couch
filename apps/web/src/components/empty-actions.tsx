"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { JoinByCode } from "@/components/join-by-code";
import { buttonClassName } from "@/components/ui/button";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";

/** Create and join actions for a new user. "Join a couch" reveals the invite box in place. */
export function EmptyActions({ showInviteHint = true }: { readonly showInviteHint?: boolean }) {
  const [joining, setJoining] = useState(false);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/couch/create" className={buttonClassName("primary")}>
          <Plus aria-hidden="true" className="size-4" />
          Create a couch
        </Link>
        <button
          type="button"
          aria-expanded={joining}
          aria-controls="join-panel"
          onClick={() => setJoining((open) => !open)}
          className={cx(buttonClassName("secondary"), "cursor-pointer")}
        >
          <Users aria-hidden="true" className="size-4" />
          Join a couch
        </button>
      </div>
      <div id="join-panel" hidden={!joining} className="w-full max-w-md text-left">
        <JoinByCode />
      </div>
      {showInviteHint ? (
        <p className="flex flex-col items-center gap-1 text-sm text-text-muted">
          <span aria-hidden="true" className="mb-2 h-px w-8 bg-border-strong" />
          Have an invite?
          <button
            type="button"
            onClick={() => setJoining(true)}
            className={cx("cursor-pointer rounded-sm font-medium text-primary hover:text-primary-hover", calmTransition, focusRing)}
          >
            Join a couch
          </button>
        </p>
      ) : null}
    </div>
  );
}
