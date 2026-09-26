import Link from "next/link";
import { Globe, Plus } from "lucide-react";
import { JoinByCode } from "@/components/join-by-code";
import { buttonClassName } from "@/components/ui/button";

/** Create, join and discover actions for a new user: a create button, the invite box, then a link to public couches. */
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
      <Link href="/find-couches" className={buttonClassName("secondary", "w-full max-w-md")}>
        <Globe aria-hidden="true" className="size-4" />
        Find a public couch
      </Link>
    </div>
  );
}
