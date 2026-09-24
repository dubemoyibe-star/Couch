"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { authErrorMessage, isEmailNotVerifiedError } from "@/lib/auth-errors";

export type SignInState = {
  readonly error: string | null;
  /** Set when sign-in was refused only because this address is not verified yet. */
  readonly unverifiedEmail: string | null;
};

export async function signInAction(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await getAuth().api.signInEmail({
      body: { email, password },
    });
  } catch (error) {
    return {
      error: authErrorMessage(error),
      unverifiedEmail: isEmailNotVerifiedError(error) ? email : null,
    };
  }

  redirect("/");
}
