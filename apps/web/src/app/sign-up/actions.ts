"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";

export type SignUpState = {
  readonly error: string | null;
};

export async function signUpAction(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "");

  try {
    await getAuth().api.signUpEmail({
      body: { email, password, name: displayName },
    });
  } catch (error) {
    return { error: authErrorMessage(error) };
  }

  redirect("/");
}
