"use server";

import { getAuth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { VERIFY_EMAIL_CALLBACK_URL } from "@/lib/verification";

export type SignUpState = {
  readonly error: string | null;
  /** Set once the account exists and a verification email has been requested. */
  readonly checkEmail: string | null;
};

export async function signUpAction(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "");

  try {
    // With verification required, sign-up creates no session, and an email
    // that is already registered gets the same response as a new one so the
    // form cannot be used to discover which addresses have accounts.
    await getAuth().api.signUpEmail({
      body: { email, password, name: displayName, callbackURL: VERIFY_EMAIL_CALLBACK_URL },
    });
  } catch (error) {
    return { error: authErrorMessage(error), checkEmail: null };
  }

  return { error: null, checkEmail: email };
}
