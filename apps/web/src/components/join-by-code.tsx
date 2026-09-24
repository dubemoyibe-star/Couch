"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import { parseInviteCode } from "@/lib/invite-input";

/** Takes a pasted invite link or code and opens its join page, which checks it on the server. */
export function JoinByCode({ className }: { readonly className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = parseInviteCode(value);
    if (!code) {
      setError("That doesn't look like an invite link. Paste the full link or the code.");
      return;
    }
    setError(null);
    router.push(`/join/${encodeURIComponent(code)}`);
  }

  return (
    <form onSubmit={onSubmit} className={cx("flex flex-col gap-2", className)}>
      <label htmlFor="join-invite" className="text-sm text-text-muted">
        Have an invite? Paste the link to join a couch.
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="join-invite"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste an invite link"
          autoComplete="off"
          spellCheck={false}
          className={cx(
            "min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-muted",
            calmTransition,
            focusRing,
          )}
        />
        <Button type="submit" variant="secondary" className="shrink-0 cursor-pointer">
          Join a couch
        </Button>
      </div>
      <FormError message={error} />
    </form>
  );
}
