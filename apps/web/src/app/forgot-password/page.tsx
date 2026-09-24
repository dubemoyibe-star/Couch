import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { AuthShell, authLinkClass } from "@/components/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?" icon={<KeyRound className="size-6" />}>
      <p className="text-center text-sm text-text-muted">
        Enter your email and we will send you a link to choose a new one.
      </p>
      <ForgotPasswordForm />
      <p className="text-center text-sm">
        <Link href="/sign-in" className={`${authLinkClass} inline-flex items-center gap-1.5`}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
