"use client";

import { useState } from "react";
import { authButtonClass } from "@/components/auth-shell";
import { FormError, FormSuccess } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { RESET_PASSWORD_REDIRECT_URL } from "@/lib/password-reset";

// Calls Better Auth's HTTP endpoint (not a Server Action) so the request goes
// through its rate limiter. The endpoint answers the same way whether or not
// the address has an account, and this form shows one fixed message on success,
// so the page cannot be used to probe which emails are registered.
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSent(false);
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: RESET_PASSWORD_REDIRECT_URL,
    });
    setPending(false);
    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many requests. Wait a minute and try again."
          : "Could not send the request. Please try again.",
      );
      return;
    }
    setSent(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <Input
        label="Email"
        type="email"
        required
        autoComplete="email"
        icon={<Mail />}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Button type="submit" loading={pending} loadingLabel="Sending…" className={authButtonClass}>
        Send reset link
      </Button>
      <FormError message={error} />
      <FormSuccess message={sent ? "If that email has an account, a reset link is on its way." : null} />
    </form>
  );
}
