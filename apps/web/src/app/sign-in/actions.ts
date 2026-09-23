"use server";

import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";

export type SignInState = {
  readonly error: string | null;
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
    return { error: authErrorMessage(error) };
  }

  redirect("/");
}
