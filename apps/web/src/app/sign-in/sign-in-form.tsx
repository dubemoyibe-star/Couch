"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { ResendVerification } from "@/components/resend-verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInAction, type SignInState } from "./actions";

const initialState: SignInState = { error: null, unverifiedEmail: null };

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <div className="flex w-full flex-col gap-4">
      <form action={formAction} className="flex w-full flex-col gap-4">
        <Input label="Email" name="email" type="email" required autoComplete="email" />
        <Input
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <FormError message={state.error} />
        <Button type="submit" loading={pending} loadingLabel="Signing in…">
          Sign in
        </Button>
      </form>
      {state.unverifiedEmail ? <ResendVerification email={state.unverifiedEmail} /> : null}
    </div>
  );
}
