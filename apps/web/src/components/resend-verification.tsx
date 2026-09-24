"use client";

import { useState } from "react";
import { authButtonClass } from "@/components/auth-shell";
import { FormError, FormSuccess } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { VERIFY_EMAIL_CALLBACK_URL } from "@/lib/verification";

type ResendVerificationProps = {
  /** When given, the address is fixed. Otherwise the visitor types it. */
  readonly email?: string;
};

// Calls Better Auth's HTTP endpoint (not a Server Action) on purpose: only
// requests over HTTP pass through Better Auth's rate limiter (3 per minute per
// client IP for this endpoint). The endpoint also answers the same way whether
// or not the address has an account, so this cannot be used to probe accounts.
export function ResendVerification({ email: fixedEmail }: ResendVerificationProps) {
  const [typedEmail, setTypedEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const email = fixedEmail ?? typedEmail;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSent(false);
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: VERIFY_EMAIL_CALLBACK_URL,
    });
    setPending(false);
    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many requests. Wait a minute and try again."
          : "Could not send the email. Please try again.",
      );
      return;
    }
    setSent(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
      {fixedEmail === undefined ? (
        <Input
          label="Email"
          id="resend-email"
          type="email"
          required
          autoComplete="email"
          focusTone="brand"
          icon={<Mail />}
          value={typedEmail}
          onChange={(event) => setTypedEmail(event.target.value)}
        />
      ) : null}
      <Button
        type="submit"
        variant="secondary"
        loading={pending}
        loadingLabel="Sending…"
        className={authButtonClass}
      >
        Resend verification email
      </Button>
      <FormError message={error} />
      <FormSuccess
        message={sent ? "If that address has an unverified account, a new link is on its way." : null}
      />
    </form>
  );
}
