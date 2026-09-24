import Link from "next/link";
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
      <Shell title="Verification link problem">
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
        <p className="text-sm">Enter your email to get a new link.</p>
        <ResendVerification />
      </Shell>
    );
  }

  if (status === "verified") {
    return (
      <Shell title="Email verified">
        {user ? (
          <>
            <p className="text-sm">Your email is verified and you are signed in.</p>
            <Link href="/" className="font-medium underline">
              Continue
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm">Your email is verified. Sign in to continue.</p>
            <Link href="/sign-in" className="font-medium underline">
              Sign in
            </Link>
          </>
        )}
      </Shell>
    );
  }

  return (
    <Shell title="Verify your email">
      <p className="text-sm">Enter your email to get a verification link.</p>
      <ResendVerification />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
