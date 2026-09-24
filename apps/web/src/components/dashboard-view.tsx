import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Info, Play } from "lucide-react";
import { ActivityRail } from "@/components/activity-rail";
import { NewCouchTile, RoomTile } from "@/components/couch-card";
import { DiscoverTabs, type DiscoverItem } from "@/components/discover-tabs";
import { EmptyActions } from "@/components/empty-actions";
import { Greeting } from "@/components/greeting";
import { LivingRoomScene } from "@/components/living-room-scene";
import { Poster } from "@/components/poster";
import { buttonClassName } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import type { CouchRoom } from "@/lib/couch-rooms";
import { darkScope } from "@/lib/dark-scope";

const ROOMS_SHOWN = 3;

/**
 * The hero panel keeps the night palette in every theme, since it holds the room scene.
 * With `full`, the scene has a fixed height and the panel a matching minimum, so content that
 * grows inside it (an opened invite box) never rescales or moves the picture.
 */
function Hero({ children, full = false }: { readonly children: ReactNode; readonly full?: boolean }) {
  return (
    <section
      style={darkScope}
      className={cx(
        "relative isolate overflow-hidden rounded-lg border border-border bg-background text-text",
        full && "min-h-152",
      )}
    >
      <LivingRoomScene
        className={cx(
          "absolute -z-20",
          full ? "inset-x-0 top-0 h-152 w-full" : "right-0 top-0 h-full w-full sm:w-[85%] lg:w-[70%]",
        )}
      />
      <div
        aria-hidden="true"
        className={cx(
          "absolute inset-x-0 top-0 -z-10",
          full
            ? "h-152 bg-[radial-gradient(70%_80%_at_50%_45%,color-mix(in_oklab,var(--color-background)_88%,transparent),color-mix(in_oklab,var(--color-background)_35%,transparent))]"
            : "h-full bg-linear-to-r from-background from-25% via-background/70 to-transparent max-sm:bg-background/70",
        )}
      />
      {children}
    </section>
  );
}

/** What is on the screen: poster, title, who is in the couch and how to get back in. */
function ContinueWatching({ room }: { readonly room: CouchRoom }) {
  const { couch, role, memberCount, media } = room;
  return (
    <div className="flex w-full max-w-xl flex-col gap-4 rounded-md border border-border bg-black/45 p-4 backdrop-blur-sm">
      <div className="flex gap-4">
        <Poster
          url={media?.posterUrl ?? null}
          seed={media?.id ?? couch.id}
          name={media?.title ?? couch.name}
          className="aspect-video w-28 self-start rounded-md sm:w-40"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
            {media ? "Continue watching" : "Your couch"}
          </p>
          <h2 className="font-display text-xl font-semibold leading-tight text-text sm:text-2xl">
            {media?.title ?? couch.name}
          </h2>
          <p className="text-sm text-text-muted">
            {couch.name} · {memberCount} {memberCount === 1 ? "member" : "members"}
          </p>
        </div>
      </div>
      {media ? (
        // Playback is not built yet, so the progress bar and times are fixed placeholders.
        <div aria-hidden="true" className="flex flex-col gap-1.5">
          <div className="h-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full w-[55%] rounded-full bg-primary" />
          </div>
          <div className="flex justify-between text-[11px] text-text-muted">
            <span>1:24:17</span>
            <span>2:32:00</span>
          </div>
        </div>
      ) : role !== "host" ? (
        <p className="text-sm text-text-muted">Nothing on yet. The host picks what plays.</p>
      ) : null}
      <div className="flex gap-2">
        <Link href={`/couch/${couch.id}`} className={buttonClassName("primary", "min-h-10 flex-1 px-4")}>
          <Play aria-hidden="true" className="size-4 fill-current" />
          Return to couch
        </Link>
        {media ? (
          <Link href={`/catalog/${media.id}`} className={buttonClassName("secondary", "min-h-10 flex-1 px-4")}>
            <Info aria-hidden="true" className="size-4" />
            View details
          </Link>
        ) : role === "host" ? (
          <Link href={`/catalog?forCouch=${couch.id}`} className={buttonClassName("secondary", "min-h-10 flex-1 px-4")}>
            Pick something to watch
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** The signed-in home: what is on the screen, your couches, what to watch next, and who is around. */
export function DashboardView({
  firstName,
  rooms,
  catalogItems,
}: {
  readonly firstName: string;
  readonly rooms: readonly CouchRoom[];
  readonly catalogItems: readonly DiscoverItem[];
}) {
  const featured = rooms.find((room) => room.media) ?? rooms[0];

  // The catalog has no popularity or date signal, so these are two fixed orderings of one list.
  const popularItems = catalogItems;
  const recentItems = [...catalogItems].reverse();
  const seen = new Set<string>();
  const continueItems: DiscoverItem[] = [];
  for (const { media } of rooms) {
    if (media && !seen.has(media.id)) {
      seen.add(media.id);
      continueItems.push({ id: media.id, title: media.title, posterUrl: media.posterUrl });
    }
  }

  // On wide screens the greeting lives in the top bar; on phones it sits at the top of the page.
  const mobileGreeting = (
    <p className="text-sm text-text-muted md:hidden">
      <Greeting name={firstName} />
    </p>
  );

  return (
    <div className="mx-auto grid w-full max-w-360 flex-1 content-start gap-6 px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-8">
        {featured ? (
          <>
            <Hero>
              <div className="flex flex-col gap-6 p-5 sm:p-8 lg:min-h-108 lg:max-w-[66%] lg:justify-center">
                <div className="flex max-w-md flex-col gap-2">
                  {mobileGreeting}
                  <h1 className="font-display text-3xl font-semibold leading-tight text-text sm:text-4xl">
                    Movie nights hit different with the right people.
                  </h1>
                </div>
                <ContinueWatching room={featured} />
              </div>
            </Hero>

            <section aria-labelledby="your-couches" className="flex flex-col gap-4">
              <div className="flex items-end justify-between gap-4">
                <h2 id="your-couches" className="font-display text-2xl font-semibold text-text">
                  Your Couches
                </h2>
                <Link
                  href="/couches"
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:text-primary-hover",
                    focusRing,
                  )}
                >
                  View all
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                {rooms.slice(0, ROOMS_SHOWN).map((room) => (
                  <RoomTile key={room.couch.id} {...room} />
                ))}
                <NewCouchTile />
              </ul>
            </section>
          </>
        ) : (
          <Hero full>
            <div className="flex flex-col items-center gap-5 px-5 py-14 text-center sm:py-20">
              {mobileGreeting}
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Your living room is empty</p>
              <h1 className="max-w-lg font-display text-3xl font-semibold leading-tight text-text sm:text-5xl">
                Start a movie night with your people.
              </h1>
              <p className="max-w-md text-text-muted">
                Create a couch, join a couch, or browse the catalog to find something to watch.
              </p>
              <EmptyActions />
            </div>
          </Hero>
        )}

        <DiscoverTabs continueItems={continueItems} popularItems={popularItems} recentItems={recentItems} />
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <ActivityRail />
      </div>
    </div>
  );
}
