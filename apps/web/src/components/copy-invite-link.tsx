"use client";

import { useState } from "react";

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
    <div className="flex flex-col gap-2 rounded border border-zinc-200 p-4 dark:border-zinc-800">
      <span className="text-sm font-medium">Invite link</span>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-black"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-black"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
