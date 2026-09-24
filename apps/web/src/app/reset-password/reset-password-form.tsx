"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError, FormSuccess } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { resetPasswordErrorMessage } from "@/lib/auth-errors";

export function ResetPasswordForm({ token }: { readonly token: string }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenRejected, setTokenRejected] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (result.error) {
      setError(resetPasswordErrorMessage(result.error.code));
      setTokenRejected(result.error.code === "INVALID_TOKEN");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4">
        <FormSuccess message="Your password has been changed." />
        <Link href="/sign-in" className="text-sm font-medium underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="new-password" className="text-sm font-medium">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
        />
      </div>
      <FormError message={error} />
      {tokenRejected ? (
        <Link href="/forgot-password" className="text-sm font-medium underline">
          Request a new link
        </Link>
      ) : null}
      <Button type="submit" loading={pending} loadingLabel="Saving…">
        Change password
      </Button>
    </form>
  );
}
