"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, Home, Sofa } from "lucide-react";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";

type Item = { readonly href: string; readonly label: string; readonly icon: ReactNode; readonly exact?: boolean };

const items: readonly Item[] = [
  { href: "/", label: "Home", icon: <Home aria-hidden="true" className="size-[1.125rem]" />, exact: true },
  { href: "/couches", label: "My Couches", icon: <Sofa aria-hidden="true" className="size-[1.125rem]" /> },
  { href: "/catalog", label: "Catalog", icon: <Clapperboard aria-hidden="true" className="size-[1.125rem]" /> },
];

function isActive(pathname: string, item: Item): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Main navigation. `sidebar` is a vertical list; `tabs` is the bottom bar used on phones. */
export function AppNav({ variant }: { readonly variant: "sidebar" | "tabs" }) {
  const pathname = usePathname();

  if (variant === "tabs") {
    return (
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium",
                active ? "text-primary" : "text-text-muted",
                calmTransition,
                focusRing,
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium",
              active ? "bg-primary/15 text-primary" : "text-text-muted hover:bg-surface-muted hover:text-text",
              calmTransition,
              focusRing,
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
