import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, Search, Settings } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { HeaderGreeting } from "@/components/header-greeting";
import { Logo } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";
import { calmTransition, cx, focusRing, inputFocus } from "@/components/ui/cx";

/** The signed-in frame: sidebar on desktop, top bar with search, and bottom tabs on phones. */
export function AppShell({ name, children }: { readonly name: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className={cx(
          "sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-text focus:shadow-xl",
          focusRing,
        )}
      >
        Skip to main content
      </a>
      <aside aria-label="Sidebar" className="sticky top-0 hidden h-dvh w-64 shrink-0 p-3 md:block">
        <div className="flex h-full flex-col gap-6 rounded-lg border border-border bg-surface/60 p-4">
          <Link href="/" aria-label="Couch home" className={cx("self-start rounded-sm", focusRing)}>
            <Logo size={30} />
          </Link>
          <AppNav variant="sidebar" />
          <div role="separator" className="h-px bg-border" />
          {/* Settings does not exist yet, so it is shown but not linked. */}
          <span
            title="Coming soon"
            className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-md px-3 text-sm font-medium text-text-muted"
          >
            <Settings aria-hidden="true" className="size-[1.125rem]" />
            Settings
            <span className="sr-only">(coming soon)</span>
          </span>
          <div className="mt-auto">
            <UserMenu name={name} placement="above" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 px-4 pb-1 pt-3 sm:px-6 md:flex-nowrap md:justify-end md:pt-4">
          <Link href="/" aria-label="Couch home" className={cx("inline-flex min-h-11 items-center rounded-sm md:hidden", focusRing)}>
            <Logo size={26} />
          </Link>
          <HeaderGreeting name={name.trim().split(/\s+/)[0] || name} />
          <div className="ml-auto flex items-center gap-3 md:order-last md:ml-0">
            {/* Notifications are not built yet; the bell is a placeholder, so it says so and does nothing. */}
            <button
              type="button"
              aria-label="Notifications (coming soon)"
              aria-disabled="true"
              className={cx(
                "inline-flex size-11 cursor-not-allowed items-center justify-center rounded-full text-text-muted hover:bg-surface-muted hover:text-text",
                calmTransition,
                focusRing,
              )}
            >
              <Bell aria-hidden="true" className="size-5" />
            </button>
            <UserMenu name={name} compact />
          </div>
          <form
            action="/catalog"
            role="search"
            aria-label="Quick catalog search"
            className="relative order-last w-full md:order-none md:max-w-sm"
          >
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            />
            <input
              type="search"
              name="q"
              aria-label="Search the catalog"
              placeholder="Search movies, shows..."
              className={cx(
                "min-h-11 w-full rounded-md border border-border-strong bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted",
                inputFocus,
              )}
            />
          </form>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col pb-20 focus:outline-none md:pb-0">{children}</main>
      </div>

      <AppNav variant="tabs" />
    </div>
  );
}
