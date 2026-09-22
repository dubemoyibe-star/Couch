import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign up</h1>
      <SignUpForm />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
