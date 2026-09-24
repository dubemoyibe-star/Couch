import { cx } from "@/components/ui/cx";
import { couchMonogram, couchPosterClass } from "@/lib/couch-poster";

/** Initial-in-a-circle avatar. Colour comes from the name, so it is stable. */
export function Avatar({
  name,
  className,
  online,
}: {
  readonly name: string;
  readonly className?: string;
  /** Adds a presence dot in the corner. */
  readonly online?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold text-text",
        couchPosterClass(name),
        className,
      )}
    >
      {couchMonogram(name)}
      {online ? (
        <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface bg-success" />
      ) : null}
    </span>
  );
}
