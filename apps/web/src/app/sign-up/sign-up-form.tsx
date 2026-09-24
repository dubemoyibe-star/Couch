"use client";

import { useActionState } from "react";
import { AuthNotice, authButtonClass } from "@/components/auth-shell";
import { FormError } from "@/components/form-feedback";
import { ResendVerification } from "@/components/resend-verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Mail, User } from "lucide-react";
import { signUpAction, type SignUpState } from "./actions";

const initialState: SignUpState = { error: null, checkEmail: null };

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  if (state.checkEmail) {
    return (
      <div className="flex w-full flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-text">Check your email</h2>
        <AuthNotice tone="success">
          We sent a verification link to <strong>{state.checkEmail}</strong>. Open it to finish
          creating your account. If you already have an account with this address, sign in instead.
        </AuthNotice>
        <ResendVerification email={state.checkEmail} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <Input
        label="Display name"
        placeholder="What should we call you?"
        name="displayName"
        type="text"
        required
        autoComplete="name"
        focusTone="brand"
        icon={<User />}
      />
      <Input
        label="Email"
        placeholder="you@example.com"
        name="email"
        type="email"
        required
        autoComplete="email"
        focusTone="brand"
        icon={<Mail />}
      />
      <Input
        label="Password"
        placeholder="At least 8 characters"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        focusTone="brand"
        icon={<Lock />}
        revealable
      />
      <div className="pt-2 [&>[role=alert]:not(:empty)]:mb-3">
        <FormError message={state.error} compact />
        <Button
          type="submit"
          loading={pending}
          loadingLabel="Creating account…"
          className={authButtonClass}
        >
          Sign up
        </Button>
      </div>
    </form>
  );
}
