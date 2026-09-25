import { Armchair, Film, Popcorn, Sparkles, Ticket } from "lucide-react";
import { EmptyActions } from "@/components/empty-actions";

/** The couches page before the visitor has any: a lit-up welcome with the create and join actions. */
export function NoCouchesEmptyState() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-10">
      <section className="relative isolate flex flex-col items-center gap-8 overflow-hidden rounded-media border border-border bg-surface px-6 py-16 text-center sm:py-20">
        {/* A faint warm glow from the top. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_75%)]"
        />
        <Film aria-hidden="true" className="absolute hidden sm:block left-[9%] top-12 size-8 -rotate-12 text-primary/40" />
        <Ticket aria-hidden="true" className="absolute hidden sm:block right-[10%] top-16 size-8 rotate-12 text-primary/40" />
        <Popcorn aria-hidden="true" className="absolute hidden sm:block bottom-14 left-[12%] size-8 -rotate-6 text-primary/35" />
        <Sparkles aria-hidden="true" className="absolute hidden sm:block bottom-16 right-[13%] size-7 text-primary/50" />

        <span aria-hidden="true" className="relative flex size-44 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-primary/20" />
          <span className="absolute inset-5 rounded-full border border-primary/30" />
          <span className="flex size-28 items-center justify-center rounded-full border border-border-strong bg-surface-muted text-primary">
            <Armchair className="size-14" strokeWidth={1.5} />
          </span>
        </span>

        <div className="flex max-w-md flex-col gap-3">
          <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">Your couch is waiting</h1>
          <p className="text-text-muted">
            Start a couch to watch together, or open an invite link from a friend to join theirs.
            Movie night starts here.
          </p>
        </div>

        <EmptyActions />
      </section>
    </div>
  );
}
