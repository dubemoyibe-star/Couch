import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <SignInForm />
      <GoogleButton errorPath="/sign-in" callbackError={error} />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Need an account?{" "}
        <Link href="/sign-up" className="font-medium underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
