import Link from "next/link";
import { AuthDivider, AuthSplit, authQuietLinkClass } from "@/components/auth-shell";
import { GoogleButton } from "@/components/google-button";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthSplit title="Create your account" subtitle="Get a seat on the couch in a minute.">
      <GoogleButton errorPath="/sign-up" callbackError={error} />
      <AuthDivider />
      <SignUpForm />
      <p className="text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className={authQuietLinkClass}>
          Sign in
        </Link>
      </p>
    </AuthSplit>
  );
}
