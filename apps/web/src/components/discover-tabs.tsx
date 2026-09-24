"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Poster } from "@/components/poster";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";

export type DiscoverItem = {
  readonly id: string;
  readonly title: string;
  readonly posterUrl: string | null;
  /** Credit line to show with the title, or null when the license asks for none. */
};

type TabId = "continue" | "popular" | "recent";

const tabs: readonly { readonly id: TabId; readonly label: string }[] = [
  { id: "continue", label: "Continue watching" },
  { id: "popular", label: "Popular" },
  { id: "recent", label: "Recently added" },
];

const tabClass = (selected: boolean) =>
  cx(
    "relative shrink-0 rounded-sm px-1 py-2 text-sm font-medium",
    selected ? "text-primary" : "text-text-muted hover:text-text",
    calmTransition,
    focusRing,
  );

/**
 * Tabbed row of catalog titles. "Continue watching" is what is on the user's
 * couches. The catalog has no popularity or date signal to sort by, so
 * "Popular" and "Recently added" are two fixed orderings of the same list.
 */
export function DiscoverTabs({
  continueItems,
  popularItems,
  recentItems,
}: {
  readonly continueItems: readonly DiscoverItem[];
  readonly popularItems: readonly DiscoverItem[];
  readonly recentItems: readonly DiscoverItem[];
}) {
  const baseId = useId();
  const [selected, setSelected] = useState<TabId>(continueItems.length > 0 ? "continue" : "popular");
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  const lists: Record<TabId, readonly DiscoverItem[]> = {
    continue: continueItems,
    popular: popularItems,
    recent: recentItems,
  };
  const items = lists[selected];

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (!next) return;
    setSelected(next.id);
    refs.current[next.id]?.focus();
  }

  return (
    <section aria-labelledby={`${baseId}-heading`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <h2 id={`${baseId}-heading`} className="font-display text-2xl font-semibold text-text">
          Discover
        </h2>
        <div role="tablist" aria-label="Discover" className="flex flex-wrap gap-x-5">
          {tabs.map((tab, index) => {
            const isSelected = tab.id === selected;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  refs.current[tab.id] = node;
                }}
                id={`${baseId}-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${baseId}-panel`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setSelected(tab.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cx(tabClass(isSelected), "cursor-pointer")}
              >
                {tab.label}
                {isSelected ? (
                  <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
                ) : null}
              </button>
            );
          })}
          <Link href="/catalog" className={tabClass(false)}>
            Browse catalog
          </Link>
        </div>
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${selected}`}>
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-text-muted">
            Nothing is on your couches yet. Pick something from the{" "}
            <Link href="/catalog" className="font-medium text-primary underline underline-offset-4">
              catalog
            </Link>
            .
          </p>
        ) : (
          // The row scrolls sideways on small screens; the scrollbar is hidden, swiping or dragging still works.
          <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 2xl:grid-cols-5 [&::-webkit-scrollbar]:hidden">
            {items.slice(0, 5).map((item, index) => (
              // The fifth title only shows where the grid has five columns, so the last row is never a lone card.
              <li key={item.id} className={cx("w-56 shrink-0 snap-start lg:w-auto", index === 4 && "lg:hidden 2xl:block")}>
                <Link
                  href={`/catalog/${item.id}`}
                  className={cx("group flex flex-col gap-2 rounded-md", calmTransition, focusRing)}
                >
                  <Poster
                    url={item.posterUrl}
                    seed={item.id}
                    name={item.title}
                    className="aspect-video w-full rounded-md motion-safe:transition-transform motion-safe:duration-300 group-hover:-translate-y-0.5"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-text">{item.title}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
