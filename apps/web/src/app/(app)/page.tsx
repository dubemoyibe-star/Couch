import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clapperboard, Play, Plus, Users } from "lucide-react";
import { getPrismaClient } from "@couch/database";
import { CatalogRail } from "@/components/catalog-rail";
import { CouchCard, NewCouchTile } from "@/components/couch-card";
import { CouchSilhouette } from "@/components/couch-silhouette";
import { Greeting } from "@/components/greeting";
import { JoinByCode } from "@/components/join-by-code";
import { Poster } from "@/components/poster";
import { buttonClassName } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { loadCouchRooms, type CouchRoom } from "@/lib/couch-rooms";
import { getCurrentUser } from "@/lib/session";

const ROOMS_SHOWN = 5;

// Low, warm light from above, like a lamp in the corner. Kept faint on purpose.
const ambient =
  "bg-[radial-gradient(55%_100%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_12%,transparent),transparent_75%)]";

/** The room that is on the screen right now: the couch with something picked, else the newest. */
function NowWatching({ room }: { readonly room: CouchRoom }) {
  const { couch, role, memberCount, media } = room;
  const title = media?.title ?? couch.name;
  return (
    <section
      aria-label="Now watching"
      className="relative isolate overflow-hidden rounded-lg border border-border bg-surface-muted shadow-[0_30px_80px_-40px_color-mix(in_oklab,var(--color-primary)_55%,transparent)]"
    >
      {media?.posterUrl ? (
        // Blurred copy of the poster as the room's backdrop; decorative.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.posterUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-20 size-full scale-125 object-cover opacity-40 blur-3xl"
        />
      ) : null}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-r from-background/95 via-background/70 to-background/30" />
      <div className="flex items-center justify-between gap-8 p-6 sm:p-10">
        <div className="flex min-w-0 flex-col gap-5">
          <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-primary">
            <Play aria-hidden="true" className="size-3.5 fill-current" />
            {media ? "Now watching" : "Your couch"}
          </p>
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-3xl font-semibold leading-tight text-text sm:text-5xl">{title}</h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-muted">
              <span>{couch.name}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Users aria-hidden="true" className="size-4" />
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/couch/${couch.id}`} className={buttonClassName("primary")}>
              Return to couch
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            {!media && role === "host" ? (
              <Link href={`/catalog?forCouch=${couch.id}`} className={buttonClassName("secondary")}>
                <Clapperboard aria-hidden="true" className="size-4" />
                Pick something to watch
              </Link>
            ) : null}
          </div>
          {!media && role !== "host" ? (
            <p className="text-sm text-text-muted">Nothing on yet. The host picks what plays.</p>
          ) : null}
        </div>
        <Poster
          url={media?.posterUrl ?? null}
          seed={media?.id ?? couch.id}
          name={title}
          className="hidden aspect-[2/3] w-36 rounded-media shadow-2xl sm:block lg:w-44"
        />
      </div>
    </section>
  );
}

function EmptyLivingRoom({ firstName }: { readonly firstName: string }) {
  return (
    <section className="relative isolate flex flex-col items-center gap-6 px-2 pb-6 pt-4 text-center sm:pt-10">
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-4 -z-10 size-[26rem] max-w-full -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <CouchSilhouette className="w-64 text-text-muted sm:w-80" />
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold text-text sm:text-5xl">
          Your living room is empty.
        </h1>
        <p className="text-text-muted sm:text-lg">
          <Greeting name={firstName} /> Start a movie night with your people.
        </p>
      </div>
      <Link href="/couch/create" className={buttonClassName("primary")}>
        <Plus aria-hidden="true" className="size-4" />
        Create a couch
      </Link>
      <JoinByCode className="mt-2 w-full max-w-md text-left" />
    </section>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const rooms = await loadCouchRooms(getPrismaClient(), user.id);
  const firstName = user.displayName.trim().split(/\s+/)[0] || user.displayName;
  const featured = rooms.find((room) => room.media) ?? rooms[0];

  return (
    <div className={cx("flex flex-1 flex-col", ambient)}>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-8 sm:py-10">
        {featured ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="font-display text-2xl font-semibold text-text sm:text-3xl">
                <Greeting name={firstName} />
              </h1>
              <Link href="/couch/create" className={buttonClassName("secondary")}>
                <Plus aria-hidden="true" className="size-4" />
                Create a couch
              </Link>
            </div>

            <NowWatching room={featured} />

            <section aria-labelledby="your-couches" className="flex flex-col gap-4">
              <div className="flex items-end justify-between gap-4">
                <h2 id="your-couches" className="font-display text-2xl font-semibold text-text">
                  Your couches
                </h2>
                {rooms.length > ROOMS_SHOWN ? (
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
                ) : null}
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rooms.slice(0, ROOMS_SHOWN).map((room) => (
                  <CouchCard key={room.couch.id} {...room} />
                ))}
                <NewCouchTile />
              </ul>
            </section>

            <CatalogRail heading="Up next in the catalog" />

            <JoinByCode className="max-w-md" />
          </>
        ) : (
          <>
            <EmptyLivingRoom firstName={firstName} />
            <CatalogRail heading="While you set up, see what you can watch" />
          </>
        )}
      </div>
    </div>
  );
}
