"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { ResendVerification } from "@/components/resend-verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUpAction, type SignUpState } from "./actions";

const initialState: SignUpState = { error: null, checkEmail: null };

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  if (state.checkEmail) {
    return (
      <div className="flex w-full flex-col gap-4">
        <h2 className="font-display text-lg font-semibold text-text">Check your email</h2>
        <p className="text-sm text-text-muted">
          We sent a verification link to <strong className="text-text">{state.checkEmail}</strong>.
          Open it to finish creating your account. If you already have an account with this
          address, sign in instead.
        </p>
        <ResendVerification email={state.checkEmail} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <Input label="Display name" name="displayName" type="text" required autoComplete="name" />
      <Input label="Email" name="email" type="email" required autoComplete="email" />
      <Input
        label="Password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
      />
      <FormError message={state.error} />
      <Button type="submit" loading={pending} loadingLabel="Creating account…">
        Sign up
      </Button>
    </form>
  );
}
