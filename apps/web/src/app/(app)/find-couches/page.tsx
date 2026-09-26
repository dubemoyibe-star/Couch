import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getPrismaClient, listCouchesForUser, listPublicCouches, type PublicCouchPage } from "@couch/database";
import { PublicCouchCard } from "@/components/couch-card";
import { NoPublicCouchesEmptyState } from "@/components/no-public-couches-empty-state";
import { buttonClassName } from "@/components/ui/button";
import { cx, inputFocus } from "@/components/ui/cx";
import { getCurrentUser } from "@/lib/session";
import type { Metadata } from "next";

const PAGE_SIZE = 24;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const metadata: Metadata = { title: "Find a couch" };

export default async function FindCouchesPage({ searchParams }: PageProps<"/find-couches">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const params = await searchParams;
  const rawQuery = firstParam(params.q);
  const query = rawQuery?.trim() ? rawQuery.trim() : undefined;
  const cursor = firstParam(params.cursor);

  const db = getPrismaClient();
  let page: PublicCouchPage;
  try {
    page = await listPublicCouches(db, { query, limit: PAGE_SIZE, cursor });
  } catch (error) {
    // A cursor that matches no couch was typed or edited by hand. Start over
    // rather than failing the page; anything else is a real error.
    if (error instanceof RangeError) {
      redirect(query ? `/find-couches?q=${encodeURIComponent(query)}` : "/find-couches");
    }
    throw error;
  }
  const { items, nextCursor } = page;
  const memberOf = new Set((await listCouchesForUser(db, user.id)).map((entry) => entry.couch.id));

  const loadMoreParams = new URLSearchParams();
  if (query) loadMoreParams.set("q", query);
  if (nextCursor) loadMoreParams.set("cursor", nextCursor);
  const loadMoreHref = nextCursor ? `/find-couches?${loadMoreParams.toString()}` : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold text-text">Find a couch</h1>
          <p className="text-text-muted">Public couches where people are watching together.</p>
        </div>
        {/* With nothing listed, the empty state carries this action instead. */}
        {items.length > 0 ? (
          <Link href="/couch/create?visibility=public" className={buttonClassName("primary")}>
            <Plus aria-hidden="true" className="size-4" />
            Create a public couch
          </Link>
        ) : null}
      </div>

      <form action="/find-couches" role="search" aria-label="Search couches" className="flex max-w-lg gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query ?? ""}
          aria-label="Search couches"
          placeholder="Search couches"
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
        <NoPublicCouchesEmptyState query={query} />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((couch) => (
              <PublicCouchCard key={couch.id} {...couch} isMember={memberOf.has(couch.id)} />
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
