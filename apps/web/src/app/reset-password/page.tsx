import { Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { AuthShell, authLinkClass } from "@/components/auth-shell";
import { FormError } from "@/components/form-feedback";
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
          <FormError message={errorMessage} />
          <p className="text-center text-sm">
            <Link href="/forgot-password" className={authLinkClass}>
              Request a new link
            </Link>
          </p>
        </>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </AuthShell>
  );
}
