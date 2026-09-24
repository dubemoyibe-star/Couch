import { Card } from "@/components/ui/card";
import { cx, focusRing } from "@/components/ui/cx";

/** Link styling shared by the auth screens. */
export const authLinkClass = cx(
  "rounded-sm font-medium text-primary underline underline-offset-4 hover:text-primary-hover",
  focusRing,
);

/** Centered card with a heading, shared by every auth screen. */
export function AuthShell({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card as="section" className="flex w-full max-w-md flex-col gap-6 p-8">
        <h1 className="font-display text-2xl font-semibold text-text">{title}</h1>
        {children}
      </Card>
    </div>
  );
}

/** Separates the email/password form from another sign-in method. */
export function AuthDivider({ label = "or" }: { readonly label?: string }) {
  return (
    <div role="separator" className="flex items-center gap-3 text-sm text-text-muted">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      {label}
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
