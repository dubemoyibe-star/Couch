import Link from "next/link";
import { AuthShell, authLinkClass } from "@/components/auth-shell";
import { FormError } from "@/components/form-feedback";
import { ResendVerification } from "@/components/resend-verification";
import { verifyLinkErrorMessage } from "@/lib/auth-errors";
import { getCurrentUser } from "@/lib/session";

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
      <AuthShell title="Verification link problem">
        <FormError message={errorMessage} />
        <p className="text-sm text-text-muted">Enter your email to get a new link.</p>
        <ResendVerification />
      </AuthShell>
    );
  }

  if (status === "verified") {
    return (
      <AuthShell title="Email verified">
        {user ? (
          <>
            <p className="text-sm text-text-muted">Your email is verified and you are signed in.</p>
            <p className="text-sm">
              <Link href="/" className={authLinkClass}>
                Continue
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-text-muted">Your email is verified. Sign in to continue.</p>
            <p className="text-sm">
              <Link href="/sign-in" className={authLinkClass}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Verify your email">
      <p className="text-sm text-text-muted">Enter your email to get a verification link.</p>
      <ResendVerification />
    </AuthShell>
  );
}
