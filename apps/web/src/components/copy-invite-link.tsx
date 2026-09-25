"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx, inputFocus } from "@/components/ui/cx";
import { FormError } from "@/components/form-feedback";

/** A read-only invite link with a copy-to-clipboard affordance. */
export function CopyInviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setFailed(true);
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
            "min-h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-muted px-3 py-2 text-sm text-text-muted",
            inputFocus,
          )}
        />
        <Button variant="secondary" onClick={handleCopy} className="px-4">
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied ? "Copied" : "Copy"}
          <span className="sr-only"> invite link</span>
        </Button>
      </div>
      <span role="status" className="sr-only">
        {copied ? "Invite link copied" : ""}
      </span>
      {/* The empty live region would still add a flex gap, so pull it back until it has a message. */}
      <div className="-mt-2 has-[p]:mt-0">
        <FormError
          message={failed ? "Could not copy automatically. Select the link above and copy it." : null}
          compact
        />
      </div>
    </div>
  );
}
