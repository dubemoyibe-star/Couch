import Link from "next/link";
import { redirect } from "next/navigation";
import { getCouch, getMembership, getPrismaClient, listCatalogMedia } from "@couch/database";
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
    <div className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-lg font-medium">Catalog</h1>

      {pickingFor ? (
        <div className="flex items-center justify-between rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <span>Picking media for {pickingFor.name}</span>
          <Link href={`/couch/${pickingFor.id}`} className="underline">
            Cancel
          </Link>
        </div>
      ) : null}

      <form action="/catalog" className="flex gap-2">
        {pickingFor ? <input type="hidden" name="forCouch" value={pickingFor.id} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={query ?? ""}
          placeholder="Search titles"
          className="w-full max-w-sm rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-black"
        />
        <button
          type="submit"
          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          Search
        </button>
      </form>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
          <p className="text-lg font-medium">{query ? "No matches" : "No catalog entries yet"}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {query
              ? "Try a different search."
              : "Licensed media will show up here once it has been added."}
          </p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/catalog/${item.id}?back=${encodeURIComponent(backHref)}${
                    pickingFor ? `&forCouch=${pickingFor.id}` : ""
                  }`}
                  className="flex flex-col gap-2 rounded border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt=""
                      className="aspect-[2/3] w-full rounded object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[2/3] w-full items-center justify-center rounded bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                      No poster
                    </div>
                  )}
                  <span className="font-medium">{item.title}</span>
                  {item.license.attributionRequired ? (
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {item.license.attribution}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          {loadMoreHref ? (
            <Link href={loadMoreHref} className="self-center text-sm underline">
              Load more
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}
