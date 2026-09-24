"use client";

import { useState } from "react";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type GoogleButtonProps = {
  /** Page to return to if Google sign-in fails, so the error can be shown there. */
  readonly errorPath: "/sign-in" | "/sign-up";
  /** The `error` query param Better Auth appended on a failed callback, if any. */
  readonly callbackError?: string;
};

// account_not_linked is the linking refusal: the email already belongs to an
// account that has not verified it, so Google is not allowed to attach to it.
function callbackErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "account_not_linked") {
    return "An account with this email already exists and its email is not verified, so it could not be linked to Google. Sign in with your password instead.";
  }
  return "Google sign-in did not complete. Please try again.";
}

export function GoogleButton({ errorPath, callbackError }: GoogleButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    // On success the browser is redirected to Google, so `pending` stays set.
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: errorPath,
    });
    if (result.error) {
      setPending(false);
      setError("Google sign-in is unavailable right now. Please try again.");
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <Button
        variant="secondary"
        loading={pending}
        loadingLabel="Redirecting to Google…"
        onClick={onClick}
      >
        Sign in with Google
      </Button>
      <FormError message={error ?? callbackErrorMessage(callbackError)} />
    </div>
  );
}
