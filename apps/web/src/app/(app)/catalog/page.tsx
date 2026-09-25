import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { getCouch, getMembership, getPrismaClient, listCatalogMedia } from "@couch/database";
import { Card } from "@/components/ui/card";
import { buttonClassName } from "@/components/ui/button";
import { cx, focusRing, inputFocus } from "@/components/ui/cx";
import { getCurrentUser } from "@/lib/session";

const PAGE_SIZE = 24;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CatalogPage({ searchParams }: PageProps<"/catalog">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const params = await searchParams;
  const rawQuery = firstParam(params.q);
  const query = rawQuery?.trim() ? rawQuery.trim() : undefined;
  const cursor = firstParam(params.cursor);

  const db = getPrismaClient();

  // Picking-for-a-couch mode: only turned on when `forCouch` names a couch
  // the signed-in user actually hosts. Re-checked here rather than trusted
  // from the query string, since it is external input; a non-host or a
  // couch that does not exist just falls back to ordinary browsing.
  const forCouchParam = firstParam(params.forCouch);
  let pickingFor: { id: string; name: string } | null = null;
  if (forCouchParam) {
    const couch = await getCouch(db, forCouchParam);
    const forCouchMembership = couch
      ? await getMembership(db, { couchId: couch.id, userId: user.id })
      : null;
    if (couch && forCouchMembership?.role === "host") {
      pickingFor = { id: couch.id, name: couch.name };
    }
  }

  const { items, nextCursor } = await listCatalogMedia(db, {
    query,
    limit: PAGE_SIZE,
    cursor,
    // No dedicated logging infrastructure exists yet (sync-catalog.ts also
    // uses plain console output), so exclusions are logged the same way.
    onExcluded: (exclusion) => {
      console.error(`catalog: excluded ${exclusion.id} (${exclusion.reason})`);
    },
  });

  const loadMoreParams = new URLSearchParams();
  if (query) loadMoreParams.set("q", query);
  if (nextCursor) loadMoreParams.set("cursor", nextCursor);
  if (pickingFor) loadMoreParams.set("forCouch", pickingFor.id);
  const loadMoreHref = nextCursor ? `/catalog?${loadMoreParams.toString()}` : null;

  // Carries the current search/cursor/picking state through to the details
  // page, so its "back to catalog" link returns to the same page the
  // visitor came from, and picking mode survives the round trip.
  const currentParams = new URLSearchParams();
  if (query) currentParams.set("q", query);
  if (cursor) currentParams.set("cursor", cursor);
  if (pickingFor) currentParams.set("forCouch", pickingFor.id);
  const backHref = `/catalog${currentParams.size > 0 ? `?${currentParams.toString()}` : ""}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold text-text">Catalog</h1>
        <p className="text-text-muted">Licensed titles you can watch together.</p>
      </div>

      {pickingFor ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="text-sm text-text">Picking media for {pickingFor.name}</span>
          <Link href={`/couch/${pickingFor.id}`} className={buttonClassName("secondary", "min-h-10 px-4")}>
            Cancel
          </Link>
        </Card>
      ) : null}

      <form action="/catalog" role="search" className="flex max-w-lg gap-2">
        {pickingFor ? <input type="hidden" name="forCouch" value={pickingFor.id} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={query ?? ""}
          aria-label="Search titles"
          placeholder="Search titles"
          className={cx(
            "min-h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-base text-text placeholder:text-text-muted",
            inputFocus,
          )}
        />
        <button type="submit" className={buttonClassName("primary", "cursor-pointer")}>
          Search
        </button>
      </form>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <Card as="section" className="flex w-full max-w-md flex-col items-center gap-3 p-8 text-center">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-full border border-border bg-surface-muted text-primary"
            >
              <Search className="size-6" />
            </span>
            <h2 className="font-display text-2xl font-semibold text-text">
              {query ? "No matches" : "No catalog entries yet"}
            </h2>
            <p className="text-text-muted">
              {query
                ? "Try a different search."
                : "Licensed media will show up here once it has been added."}
            </p>
          </Card>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/catalog/${item.id}?back=${encodeURIComponent(backHref)}${
                    pickingFor ? `&forCouch=${pickingFor.id}` : ""
                  }`}
                  className={cx("group flex flex-col gap-3 rounded-media", focusRing)}
                >
                  {/* Artwork is shown as delivered: no filter, tint, or overlay. */}
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt=""
                      className="aspect-[2/3] w-full rounded-media object-cover shadow-md motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:-translate-y-1"
                    />
                  ) : (
                    <div className="flex aspect-[2/3] w-full items-center justify-center rounded-media border border-border bg-surface-muted px-3 text-center font-display text-lg text-text-muted">
                      {item.title}
                    </div>
                  )}
                  <span className="flex flex-col gap-0.5 px-1">
                    <span className="text-sm font-medium leading-snug text-text group-hover:text-primary">
                      {item.title}
                    </span>
                    {item.releaseYear ? (
                      <span className="text-xs text-text-muted">{item.releaseYear}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {loadMoreHref ? (
            <Link href={loadMoreHref} className={buttonClassName("secondary", "self-center")}>
              Load more
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}
