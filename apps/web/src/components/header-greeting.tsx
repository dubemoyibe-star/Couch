"use client";

import { usePathname } from "next/navigation";
import { Greeting } from "@/components/greeting";

/** Large greeting on the left of the top bar, on the home page only and only where there is room. */
export function HeaderGreeting({ name }: { readonly name: string }) {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return (
    <p className="hidden min-w-0 flex-1 truncate font-display text-2xl font-semibold text-text md:block lg:text-3xl">
      <Greeting name={name} />
    </p>
  );
}
