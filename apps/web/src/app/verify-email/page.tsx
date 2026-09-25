import { Mail, MailCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { AuthNotice, AuthShell, authButtonClass } from "@/components/auth-shell";
import { ResendVerification } from "@/components/resend-verification";
import { buttonClassName } from "@/components/ui/button";
import { verifyLinkErrorMessage } from "@/lib/auth-errors";
import { getCurrentUser } from "@/lib/session";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Verify your email" };

// Better Auth verifies the token at /api/auth/verify-email and redirects here:
// with `?status=verified` on success (the user is then signed in), or with
// `?error=<CODE>` when the link is expired or invalid. A link that was already
// used redirects as success again, without a session.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error, status } = await searchParams;
  const user = await getCurrentUser();
  const errorMessage = verifyLinkErrorMessage(error);

  if (errorMessage) {
    return (
      <AuthShell title="Verification link problem" icon={<TriangleAlert className="size-6" />}>
        <AuthNotice tone="error">{errorMessage}</AuthNotice>
        <p className="text-center text-sm text-text-muted">Enter your email to get a new link.</p>
        <ResendVerification />
      </AuthShell>
    );
  }

  if (status === "verified") {
    return (
      <AuthShell title="Email verified" icon={<MailCheck className="size-6" />}>
        {user ? (
          <>
            <AuthNotice tone="success">Your email is verified and you are signed in.</AuthNotice>
            <Link href="/" className={buttonClassName("primary", authButtonClass)}>
              Continue
            </Link>
          </>
        ) : (
          <>
            <AuthNotice tone="success">Your email is verified. Sign in to continue.</AuthNotice>
            <Link href="/sign-in" className={buttonClassName("primary", authButtonClass)}>
              Sign in
            </Link>
          </>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Verify your email" icon={<Mail className="size-6" />}>
      <p className="text-center text-sm text-text-muted">Enter your email to get a verification link.</p>
      <ResendVerification />
    </AuthShell>
  );
}
