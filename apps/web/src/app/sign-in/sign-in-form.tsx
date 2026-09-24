"use client";

import Link from "next/link";
import { useActionState } from "react";
import { authButtonClass } from "@/components/auth-shell";
import { FormError } from "@/components/form-feedback";
import { ResendVerification } from "@/components/resend-verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Mail } from "lucide-react";
import { signInAction, type SignInState } from "./actions";

const initialState: SignInState = { error: null, unverifiedEmail: null };

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <div className="flex w-full flex-col gap-4">
      <form action={formAction} className="flex w-full flex-col gap-4">
        <Input
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          icon={<Mail />}
        />
        <Input
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          icon={<Lock />}
          revealable
          labelAction={
            <Link href="/forgot-password" className="rounded-sm text-xs font-medium text-primary hover:text-primary-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus">
              Forgot password?
            </Link>
          }
        />
        <div className="pt-2 [&>[role=alert]:not(:empty)]:mb-3">
          <FormError message={state.error} compact />
          <Button
            type="submit"
            loading={pending}
            loadingLabel="Signing in…"
            className={authButtonClass}
          >
            Sign in
          </Button>
        </div>
      </form>
      {state.unverifiedEmail ? <ResendVerification email={state.unverifiedEmail} /> : null}
    </div>
  );
}
