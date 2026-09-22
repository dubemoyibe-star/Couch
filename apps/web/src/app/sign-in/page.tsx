import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <SignInForm />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Need an account?{" "}
        <Link href="/sign-up" className="font-medium underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
