"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AuthNotice, authButtonClass } from "@/components/auth-shell";
import { FormError } from "@/components/form-feedback";
import { Button, buttonClassName } from "@/components/ui/button";
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
        <AuthNotice tone="success">Your password has been changed. You can now sign in.</AuthNotice>
        <Link href="/sign-in" className={buttonClassName("primary", authButtonClass)}>
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
        icon={<Lock />}
        revealable
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <div className="flex flex-col gap-3">
        <FormError message={error} compact />
        <Button type="submit" loading={pending} loadingLabel="Saving…" className={authButtonClass}>
          Change password
        </Button>
        {tokenRejected ? (
          <Link href="/forgot-password" className={buttonClassName("secondary", authButtonClass)}>
            Request a new link
          </Link>
        ) : null}
      </div>
    </form>
  );
}
