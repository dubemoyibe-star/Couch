import Link from "next/link";
import { Globe, Plus } from "lucide-react";
import { JoinByCode } from "@/components/join-by-code";
import { buttonClassName } from "@/components/ui/button";

/** Create, discover and join actions for a new user: create and find-a-public-couch buttons side by side, then the invite box. */
export function EmptyActions() {
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <Link href="/couch/create" className={buttonClassName("primary", "flex-1")}>
          <Plus aria-hidden="true" className="size-4" />
          Create a couch
        </Link>
        <Link href="/find-couches" className={buttonClassName("secondary", "flex-1")}>
          <Globe aria-hidden="true" className="size-4" />
          Find a public couch
        </Link>
      </div>
      <div className="flex w-full max-w-md items-center gap-3 text-xs uppercase tracking-widest text-text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border-strong" />
        or
        <span className="h-px flex-1 bg-border-strong" />
      </div>
      <JoinByCode className="w-full max-w-md text-left" />
    </div>
  );
}
