import Link from "next/link";
import { ChevronRight, Plus, Users } from "lucide-react";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import type { CouchRoom } from "@/lib/couch-rooms";

/** Dashed "add" tile that ends a couch grid. */
export function NewCouchTile({ hint = "Start a new watch party" }: { readonly hint?: string }) {
  return (
    <li>
      <Link
        href="/couch/create"
        className={cx(
          "group flex h-full min-h-28 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong p-4 text-center text-text-muted hover:border-primary hover:bg-surface hover:text-text",
          calmTransition,
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full border border-current motion-safe:transition-transform group-hover:scale-110"
        >
          <Plus className="size-5" />
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-medium text-text">Create a couch</span>
          <span className="text-xs">{hint}</span>
        </span>
      </Link>
    </li>
  );
}

/** Compact couch tile for the dashboard: the current artwork behind the name and who is in it. */
export function RoomTile({ couch, memberCount, media }: CouchRoom) {
  return (
    <li>
      <Link
        href={`/couch/${couch.id}`}
        className={cx(
          "group relative isolate flex h-full min-h-28 items-end overflow-hidden rounded-md border border-border bg-surface",
          calmTransition,
          focusRing,
        )}
      >
        <span aria-hidden="true" className="absolute inset-0 -z-10">
          <Poster
            url={media?.posterUrl ?? null}
            seed={media?.id ?? couch.id}
            name={couch.name}
            bordered={false}
            monogram={false}
            className="size-full motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-105"
          />
        </span>
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/45 to-black/10"
        />
        <span className="flex w-full items-end justify-between gap-2 p-4 text-[#F4EEE7]">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-display text-lg font-semibold">{couch.name}</span>
            <span className="truncate text-xs text-[#E4D8CA]">
              {memberCount} {memberCount === 1 ? "member" : "members"} ·{" "}
              {media ? media.title : "Nothing on yet"}
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-5 shrink-0 text-[#E4D8CA] motion-safe:transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </li>
  );
}

/** A couch as a roomier card: what is on the screen, who is in it, and how to get back in. */
export function CouchCard({ couch, role, memberCount, media }: CouchRoom) {
  return (
    <Card as="li" className="overflow-hidden p-0">
      <Link
        href={`/couch/${couch.id}`}
        className={cx("group flex h-full min-h-52 gap-4 rounded-md p-4 hover:bg-surface-muted", calmTransition, focusRing)}
      >
        <Poster
          url={media?.posterUrl ?? null}
          seed={media?.id ?? couch.id}
          name={media?.title ?? couch.name}
          className="aspect-[3/4] w-28 self-stretch rounded-md"
        />
        <span className="flex min-w-0 flex-1 flex-col justify-between gap-3 py-1">
          <span className="flex flex-col gap-1">
            <span className="truncate font-display text-xl font-semibold text-text">{couch.name}</span>
            <span className="truncate text-sm text-text-muted">
              {media ? (
                <>
                  <span className="text-text">On the screen:</span> {media.title}
                </>
              ) : (
                "Nothing on yet"
              )}
            </span>
          </span>
          <span className="flex items-center justify-between gap-3 text-sm text-text-muted">
            <Badge tone={role === "host" ? "primary" : "neutral"}>{role === "host" ? "Host" : "Participant"}</Badge>
            <span className="inline-flex items-center gap-1.5">
              <Users aria-hidden="true" className="size-4" />
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>
          </span>
        </span>
      </Link>
    </Card>
  );
}
