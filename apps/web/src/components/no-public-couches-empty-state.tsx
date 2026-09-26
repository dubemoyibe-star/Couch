import Link from "next/link";
import { Film, Globe, Plus, Sparkles, Ticket, Users } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";

/**
 * Discovery with nothing to show. Without a search it says no one has opened a
 * couch yet and invites the visitor to be first; with one it says nothing
 * matched and offers to clear the search. Both suggest creating a public couch.
 */
export function NoPublicCouchesEmptyState({ query }: { readonly query?: string }) {
  return (
    <div className="relative isolate flex flex-col items-center gap-6 overflow-hidden rounded-media border border-border bg-surface px-6 py-14 text-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_22%,transparent),transparent_75%)]"
      />
      <Film aria-hidden="true" className="absolute hidden sm:block left-[10%] top-10 size-7 -rotate-12 text-primary/40" />
      <Ticket aria-hidden="true" className="absolute hidden sm:block right-[12%] top-14 size-7 rotate-12 text-primary/40" />
      <Users aria-hidden="true" className="absolute hidden sm:block bottom-10 left-[14%] size-6 rotate-6 text-text-muted/40" />
      <Sparkles aria-hidden="true" className="absolute hidden sm:block bottom-12 right-[15%] size-6 text-primary/50" />

      <span
        aria-hidden="true"
        className="flex size-24 items-center justify-center rounded-full border border-border-strong bg-surface-muted text-primary shadow-[0_0_48px_-8px_var(--color-primary)]"
      >
        <Globe className="size-11" strokeWidth={1.5} />
      </span>

      <div className="flex max-w-sm flex-col gap-2">
        <h2 className="font-display text-2xl font-semibold text-text sm:text-3xl">
          {query ? "No couches match that" : "No public couches yet"}
        </h2>
        <p className="text-text-muted">
          {query
            ? "Try a different search, or open a public couch of your own and let others find you."
            : "Be the first. Create a couch and choose Public, and anyone can find it here."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/couch/create?visibility=public" className={buttonClassName("primary", "min-h-11 px-6")}>
          <Plus aria-hidden="true" className="size-4" />
          Create a public couch
        </Link>
        {query ? (
          <Link href="/find-couches" className={buttonClassName("secondary", "min-h-11 px-6")}>
            Clear search
          </Link>
        ) : null}
      </div>
    </div>
  );
}
