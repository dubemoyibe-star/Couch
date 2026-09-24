import Link from "next/link";
import { Logo } from "@/components/logo";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import { getCurrentUser } from "@/lib/session";
import { signOutAction } from "@/app/sign-out/actions";

const navLinkClass = cx(
  "rounded-sm px-2 py-1 text-sm font-medium text-text-muted hover:text-text",
  calmTransition,
  focusRing,
);

// Secondary and deliberately small so the header stays quiet next to the content.
const signOutClass = cx(
  "inline-flex min-h-9 cursor-pointer items-center rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-text hover:border-text-muted hover:bg-surface-muted",
  calmTransition,
  focusRing,
);

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/" aria-label="Couch home" className={cx("rounded-sm", focusRing)}>
              <Logo size={26} />
            </Link>
            <nav aria-label="Main" className="flex items-center gap-1">
              <Link href="/" className={navLinkClass}>
                My Couches
              </Link>
              <Link href="/catalog" className={navLinkClass}>
                Catalog
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {user ? (
              <span className="hidden max-w-40 truncate text-sm text-text-muted sm:inline">
                {user.displayName}
              </span>
            ) : null}
            <form action={signOutAction}>
              <button type="submit" className={signOutClass}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
