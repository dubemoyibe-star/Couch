import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import { couchMonogram, couchPosterClass } from "@/lib/couch-poster";

export type CouchCardProps = {
  readonly id: string;
  readonly name: string;
  readonly role: "host" | "participant";
  readonly memberCount: number;
};

/** Dashed "add" tile that ends a couch grid. */
export function NewCouchTile() {
  return (
    <li>
      <Link
        href="/couch/create"
        className={cx(
          "group flex h-full min-h-56 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border-strong p-5 text-text-muted hover:border-primary hover:bg-surface hover:text-text",
          calmTransition,
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full border border-current motion-safe:transition-transform group-hover:scale-110"
        >
          <Plus className="size-5" />
        </span>
        <span className="font-medium">Start a new couch</span>
      </Link>
    </li>
  );
}

/** A couch as a poster-style card. The link inside owns the boundary and focus treatment. */
export function CouchCard({ id, name, role, memberCount }: CouchCardProps) {
  return (
    <Card as="li" className="overflow-hidden p-0">
      <Link
        href={`/couch/${id}`}
        className={cx(
          "group flex h-full flex-col rounded-md hover:bg-surface-muted",
          calmTransition,
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "relative flex aspect-[16/9] items-center justify-center overflow-hidden border-b border-border",
            couchPosterClass(id),
          )}
        >
          <span className="absolute -right-6 -top-6 size-28 rounded-full border border-text/15" />
          <span className="absolute -right-2 -top-2 size-16 rounded-full border border-text/15" />
          <span className="font-display text-6xl font-semibold text-text/90 motion-safe:transition-transform motion-safe:duration-300 group-hover:scale-110">
            {couchMonogram(name)}
          </span>
        </span>
        <span className="flex flex-col gap-3 p-5">
          <span className="truncate font-display text-xl font-semibold text-text">{name}</span>
          <span className="flex items-center justify-between gap-3 text-sm text-text-muted">
            <Badge tone={role === "host" ? "primary" : "neutral"}>
              {role === "host" ? "Host" : "Participant"}
            </Badge>
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
