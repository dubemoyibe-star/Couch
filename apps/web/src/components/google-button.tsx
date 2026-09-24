"use client";

import { useEffect, useState } from "react";
import { authButtonClass } from "@/components/auth-shell";
import { FormError } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

// The multicolor Google "G".
function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 01-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.75c-.98.66-2.24 1.06-3.74 1.06-2.87 0-5.3-1.94-6.17-4.55H2.17v2.84A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M5.83 14.1A6.6 6.6 0 015.48 12c0-.73.13-1.44.35-2.1V7.06H2.17A11 11 0 001 12c0 1.77.42 3.45 1.17 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 002.17 7.06l3.66 2.84C6.7 7.32 9.13 5.38 12 5.38z" />
    </svg>
  );
}

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

  // Coming back from Google with the browser Back button restores this page from
  // the back/forward cache with `pending` still set. Clear it when that happens.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setPending(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

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
        className={authButtonClass}
        loading={pending}
        loadingLabel="Redirecting to Google…"
        onClick={onClick}
      >
        <GoogleIcon />
        Continue with Google
      </Button>
      <FormError message={error ?? callbackErrorMessage(callbackError)} />
    </div>
  );
}
