import Link from "next/link";
import { Plus } from "lucide-react";
import { JoinByCode } from "@/components/join-by-code";
import { buttonClassName } from "@/components/ui/button";

/** Create and join actions for a new user: a create button, then the invite box always visible below it. */
export function EmptyActions() {
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <Link href="/couch/create" className={buttonClassName("primary", "w-full max-w-md")}>
        <Plus aria-hidden="true" className="size-4" />
        Create a couch
      </Link>
      <div className="flex w-full max-w-md items-center gap-3 text-xs uppercase tracking-widest text-text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border-strong" />
        or
        <span className="h-px flex-1 bg-border-strong" />
      </div>
      <JoinByCode className="w-full max-w-md text-left" />
    </div>
  );
}
