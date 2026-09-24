import Link from "next/link";
import { AuthShell, authLinkClass } from "@/components/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?">
      <p className="text-sm text-text-muted">
        Enter your email and we will send you a link to choose a new one.
      </p>
      <ForgotPasswordForm />
      <p className="text-sm">
        <Link href="/sign-in" className={authLinkClass}>
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
