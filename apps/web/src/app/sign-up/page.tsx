import Link from "next/link";
import { AuthDivider, AuthShell, authLinkClass } from "@/components/auth-shell";
import { GoogleButton } from "@/components/google-button";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell title="Sign up">
      <SignUpForm />
      <AuthDivider />
      <GoogleButton errorPath="/sign-up" callbackError={error} />
      <p className="text-sm text-text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className={authLinkClass}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
