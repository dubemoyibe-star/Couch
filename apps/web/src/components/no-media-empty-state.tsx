import Link from "next/link";
import { Clapperboard, Film, Popcorn, Search, Sparkles, Ticket } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";

/**
 * What the couch page shows before anything is picked: a dark screen with
 * popcorn and a few drifting props. The host gets the way to pick something;
 * everyone else is told the host is choosing.
 */
export function NoMediaEmptyState({
  isHost,
  pickHref,
}: {
  readonly isHost: boolean;
  readonly pickHref: string;
}) {
  return (
    <div className="relative isolate flex flex-col items-center gap-6 overflow-hidden rounded-media border border-border bg-surface px-6 py-14 text-center">
      {/* A projector-beam glow behind the icon. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_28%,transparent),transparent_75%)]"
      />
      {/* Props sit at the edges and stay out of the way of the text. */}
      <Film aria-hidden="true" className="absolute left-[10%] top-10 size-7 -rotate-12 text-primary/40" />
      <Ticket aria-hidden="true" className="absolute right-[12%] top-14 size-7 rotate-12 text-primary/40" />
      <Clapperboard aria-hidden="true" className="absolute bottom-10 left-[14%] size-6 rotate-6 text-text-muted/40" />
      <Sparkles aria-hidden="true" className="absolute bottom-12 right-[15%] size-6 text-primary/50" />

      <span
        aria-hidden="true"
        className="flex size-24 items-center justify-center rounded-full border border-border-strong bg-surface-muted text-primary shadow-[0_0_48px_-8px_var(--color-primary)]"
      >
        <Popcorn className="size-11" strokeWidth={1.5} />
      </span>

      <div className="flex max-w-sm flex-col gap-2">
        <p className="font-display text-2xl font-semibold text-text sm:text-3xl">The screen&apos;s dark</p>
        <p className="text-text-muted">
          {isHost
            ? "Pick something to watch and it lights up for everyone on the couch. Snacks are on you."
            : "The host is picking something. Grab your snacks, it won't be long."}
        </p>
      </div>

      {isHost ? (
        <Link href={pickHref} className={buttonClassName("primary", "min-h-11 px-6")}>
          <Search aria-hidden="true" className="size-4" />
          Search the catalog
        </Link>
      ) : null}
    </div>
  );
}
