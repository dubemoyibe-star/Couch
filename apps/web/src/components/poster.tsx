import { cx } from "@/components/ui/cx";
import { couchMonogram, couchPosterClass } from "@/lib/couch-poster";

/**
 * Artwork box. Shows the poster when there is one, otherwise a stable gradient
 * with the first letter of the name. The image is decorative: the title is
 * always rendered as text next to it.
 */
export function Poster({
  url,
  seed,
  name,
  className,
  bordered = true,
  monogram = true,
}: {
  readonly url: string | null;
  readonly seed: string;
  readonly name: string;
  readonly className?: string;
  readonly bordered?: boolean;
  /** Show the first letter when there is no image. Off where text sits on top of the box. */
  readonly monogram?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative block shrink-0 overflow-hidden",
        bordered && "border border-border",
        couchPosterClass(seed),
        className,
      )}
    >
      {url ? (
        // Provider-hosted artwork from arbitrary hosts, so next/image's host allowlist does not fit.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : monogram ? (
        <span className="absolute inset-0 flex items-center justify-center font-display text-3xl font-semibold text-text/90">
          {couchMonogram(name)}
        </span>
      ) : null}
    </span>
  );
}
