"use client";

import Link from "next/link";
import { useState } from "react";
import { authLinkClass } from "@/components/auth-shell";
import { FormError, FormSuccess } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <div className="flex w-full flex-col gap-4">
        <FormSuccess message="Your password has been changed." />
        <Link href="/sign-in" className={authLinkClass}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <Input
        label="New password"
        type="password"
        required
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <FormError message={error} />
      {tokenRejected ? (
        <Link href="/forgot-password" className={authLinkClass}>
          Request a new link
        </Link>
      ) : null}
      <Button type="submit" loading={pending} loadingLabel="Saving…">
        Change password
      </Button>
    </form>
  );
}
