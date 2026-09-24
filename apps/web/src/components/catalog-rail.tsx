import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPrismaClient, listCatalogMedia } from "@couch/database";
import { Poster } from "@/components/poster";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";

const RAIL_SIZE = 10;

/** A horizontal row of catalog titles. Renders nothing when the catalog is empty. */
export async function CatalogRail({ heading }: { readonly heading: string }) {
  const { items } = await listCatalogMedia(getPrismaClient(), {
    limit: RAIL_SIZE,
    onExcluded: (exclusion) => {
      console.error(`dashboard: excluded ${exclusion.id} (${exclusion.reason})`);
    },
  });
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="catalog-rail" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 id="catalog-rail" className="font-display text-2xl font-semibold text-text">
          {heading}
        </h2>
        <Link
          href="/catalog"
          className={cx(
            "inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:text-primary-hover",
            focusRing,
          )}
        >
          Browse catalog
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <ul className="-mx-6 flex snap-x gap-4 overflow-x-auto px-6 pb-3">
        {items.map((item) => (
          <li key={item.id} className="w-36 shrink-0 snap-start sm:w-40">
            <Link
              href={`/catalog/${item.id}`}
              className={cx("group flex flex-col gap-2 rounded-md", calmTransition, focusRing)}
            >
              <Poster
                url={item.posterUrl ?? null}
                seed={item.id}
                name={item.title}
                className="aspect-[2/3] w-full rounded-media motion-safe:transition-transform motion-safe:duration-300 group-hover:-translate-y-1"
              />
              <span className="text-sm font-medium text-text">{item.title}</span>
              {item.license.attributionRequired ? (
                <span className="-mt-1.5 text-xs text-text-muted">{item.license.attribution}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
