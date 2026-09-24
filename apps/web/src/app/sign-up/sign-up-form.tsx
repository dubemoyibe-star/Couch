"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-feedback";
import { ResendVerification } from "@/components/resend-verification";
import { SubmitButton } from "@/components/submit-button";
import { signUpAction, type SignUpState } from "./actions";

const initialState: SignUpState = { error: null, checkEmail: null };

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, initialState);

  if (state.checkEmail) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm">
          We sent a verification link to <strong>{state.checkEmail}</strong>. Open it to finish
          creating your account. If you already have an account with this address, sign in instead.
        </p>
        <ResendVerification email={state.checkEmail} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          autoComplete="name"
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
        />
      </div>
      <FormError message={state.error} />
      <SubmitButton>Sign up</SubmitButton>
    </form>
  );
}
