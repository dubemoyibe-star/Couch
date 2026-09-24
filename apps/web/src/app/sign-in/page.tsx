import Link from "next/link";
import { AuthDivider, AuthShell, authLinkClass } from "@/components/auth-shell";
import { GoogleButton } from "@/components/google-button";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell title="Sign in">
      <SignInForm />
      <AuthDivider />
      <GoogleButton errorPath="/sign-in" callbackError={error} />
      <div className="flex flex-col gap-2 text-sm text-text-muted">
        <p>
          <Link href="/forgot-password" className={authLinkClass}>
            Forgot your password?
          </Link>
        </p>
        <p>
          Need an account?{" "}
          <Link href="/sign-up" className={authLinkClass}>
            Sign up
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
