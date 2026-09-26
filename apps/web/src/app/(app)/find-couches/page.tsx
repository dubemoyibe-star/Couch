import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Users } from "lucide-react";
import { getPrismaClient, listPublicCouches, type PublicCouchPage } from "@couch/database";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

  let page: PublicCouchPage;
  try {
    page = await listPublicCouches(getPrismaClient(), { query, limit: PAGE_SIZE, cursor });
  } catch (error) {
    // A cursor that matches no couch was typed or edited by hand. Start over
    // rather than failing the page; anything else is a real error.
    if (error instanceof RangeError) {
      redirect(query ? `/find-couches?q=${encodeURIComponent(query)}` : "/find-couches");
    }
    throw error;
  }
  const { items, nextCursor } = page;

  const loadMoreParams = new URLSearchParams();
  if (query) loadMoreParams.set("q", query);
  if (nextCursor) loadMoreParams.set("cursor", nextCursor);
  const loadMoreHref = nextCursor ? `/find-couches?${loadMoreParams.toString()}` : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold text-text">Find a couch</h1>
        <p className="text-text-muted">Public couches where people are watching together.</p>
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
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
          <Card as="section" className="flex w-full max-w-md flex-col items-center gap-3 p-8 text-center">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-full border border-border bg-surface-muted text-primary"
            >
              <Search className="size-6" />
            </span>
            <h2 className="font-display text-2xl font-semibold text-text">
              {query ? "No matches" : "No public couches yet"}
            </h2>
            <p className="text-text-muted">
              {query
                ? "Try a different search."
                : "Couches their hosts make public will show up here."}
            </p>
          </Card>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((couch) => (
              <Card as="li" key={couch.id} className="flex items-center gap-4 p-4">
                <Poster
                  url={couch.media?.posterUrl ?? null}
                  seed={couch.id}
                  name={couch.name}
                  className="aspect-[2/3] w-16 rounded-media"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Badge tone="primary" className="self-start">
                    Public couch
                  </Badge>
                  <h2 className="line-clamp-2 break-words font-display text-xl font-semibold leading-tight text-text">
                    {couch.name}
                  </h2>
                  <p className="inline-flex items-center gap-1.5 text-sm text-text-muted">
                    <Users aria-hidden="true" className="size-4" />
                    {couch.memberCount} {couch.memberCount === 1 ? "member" : "members"}
                  </p>
                  <p className="line-clamp-2 text-sm text-text-muted">
                    {couch.media ? (
                      <>
                        <span className="text-text">On the screen:</span> {couch.media.title}
                      </>
                    ) : (
                      "Nothing on yet"
                    )}
                  </p>
                </div>
              </Card>
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
