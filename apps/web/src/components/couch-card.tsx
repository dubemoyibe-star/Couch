import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import type { CouchRoom } from "@/lib/couch-rooms";

/** Dashed "add" tile that ends a couch grid. */
export function NewCouchTile() {
  return (
    <li>
      <Link
        href="/couch/create"
        className={cx(
          "group flex h-full min-h-36 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border-strong p-5 text-text-muted hover:border-primary hover:bg-surface hover:text-text",
          calmTransition,
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full border border-current motion-safe:transition-transform group-hover:scale-110"
        >
          <Plus className="size-5" />
        </span>
        <span className="font-medium">Start a new couch</span>
      </Link>
    </li>
  );
}

/** A couch as a room: what is on the screen, who is in it, and how to get back in. */
export function CouchCard({ couch, role, memberCount, media }: CouchRoom) {
  return (
    <Card as="li" className="overflow-hidden p-0">
      <Link
        href={`/couch/${couch.id}`}
        className={cx("group flex h-full gap-4 rounded-md p-4 hover:bg-surface-muted", calmTransition, focusRing)}
      >
        <Poster
          url={media?.posterUrl ?? null}
          seed={media?.id ?? couch.id}
          name={media?.title ?? couch.name}
          className="aspect-[2/3] w-20 rounded-md"
        />
        <span className="flex min-w-0 flex-1 flex-col justify-between gap-3">
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
