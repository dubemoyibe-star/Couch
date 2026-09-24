"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";

/** Header nav link that marks the current section. */
export function NavLink({
  href,
  exact = false,
  children,
}: {
  readonly href: string;
  readonly exact?: boolean;
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "rounded-sm px-2.5 py-1 text-sm font-medium",
        active ? "bg-surface-muted text-text" : "text-text-muted hover:text-text",
        calmTransition,
        focusRing,
      )}
    >
      {children}
    </Link>
  );
}
