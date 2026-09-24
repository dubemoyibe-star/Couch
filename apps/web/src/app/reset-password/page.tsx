import Link from "next/link";
import { resetLinkErrorMessage } from "@/lib/auth-errors";
import { ResetPasswordForm } from "./reset-password-form";

// Better Auth checks the emailed link at /api/auth/reset-password/<token> and
// redirects here with `?token=<TOKEN>` when it is usable, or `?error=INVALID_TOKEN`
// when it is unknown or expired. A visit with neither is treated as an unusable link.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const errorMessage = error || !token ? resetLinkErrorMessage(error ?? "INVALID_TOKEN") : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      {errorMessage || !token ? (
        <>
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
          <Link href="/forgot-password" className="text-sm font-medium underline">
            Request a new link
          </Link>
        </>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </div>
  );
}
