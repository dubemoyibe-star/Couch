import Link from "next/link";
import { AuthDivider, AuthSplit, authQuietLinkClass } from "@/components/auth-shell";
import { GoogleButton } from "@/components/google-button";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthSplit title="Welcome back" subtitle="Sign in to pick up where you left off.">
      <GoogleButton errorPath="/sign-in" callbackError={error} />
      <AuthDivider />
      <SignInForm />
      <p className="text-center text-sm text-text-muted">
        Don&apos;t have an account yet?{" "}
        <Link href="/sign-up" className={authQuietLinkClass}>
          Sign up
        </Link>
      </p>
    </AuthSplit>
  );
}
