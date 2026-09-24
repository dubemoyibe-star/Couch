"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";

/** A read-only invite link with a copy-to-clipboard affordance. */
export function CopyInviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="invite-link" className="text-sm font-medium text-text">
        Invite link
      </label>
      <div className="flex items-center gap-2">
        <input
          id="invite-link"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
          className={cx(
            "min-h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-muted px-3 py-2 text-sm text-text-muted",
            calmTransition,
            focusRing,
          )}
        />
        <Button variant="secondary" onClick={handleCopy} className="min-h-10 px-4">
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
    </div>
  );
}
