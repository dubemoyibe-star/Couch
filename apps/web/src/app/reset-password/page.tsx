import { Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { AuthNotice, AuthShell, authButtonClass } from "@/components/auth-shell";
import { buttonClassName } from "@/components/ui/button";
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
    <AuthShell title="Choose a new password" icon={errorMessage || !token ? <TriangleAlert className="size-6" /> : <Lock className="size-6" />}>
      {errorMessage || !token ? (
        <>
          <AuthNotice tone="error">{errorMessage}</AuthNotice>
          <Link href="/forgot-password" className={buttonClassName("primary", authButtonClass)}>
            Request a new link
          </Link>
        </>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </AuthShell>
  );
}
