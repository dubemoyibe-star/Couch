import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Forgot your password?</h1>
      <p className="max-w-sm text-center text-sm">Enter your email and we will send you a link to choose a new one.</p>
      <ForgotPasswordForm />
      <Link href="/sign-in" className="text-sm font-medium underline">
        Back to sign in
      </Link>
    </div>
  );
}
