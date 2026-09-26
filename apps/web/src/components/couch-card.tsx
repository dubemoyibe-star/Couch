import Link from "next/link";
import { ChevronRight, Globe, Plus, Users } from "lucide-react";
import { JoinPublicCouchForm } from "@/app/(app)/find-couches/join-public-couch-form";
import { Poster } from "@/components/poster";
import { Badge } from "@/components/ui/badge";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import type { CouchRoom } from "@/lib/couch-rooms";

/** Dashed "add" tile that ends a couch grid. */
export function NewCouchTile({ hint = "Start a new watch party" }: { readonly hint?: string }) {
  return (
    <li>
      <Link
        href="/couch/create"
        className={cx(
          "group flex h-full min-h-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong p-4 text-center text-text-muted hover:border-primary hover:bg-surface hover:text-text",
          calmTransition,
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full border border-current motion-safe:transition-transform motion-safe:group-hover:scale-105"
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
          "group relative isolate flex h-full min-h-56 items-end overflow-hidden rounded-md border border-border bg-surface",
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
            className="size-full motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105"
          />
        </span>
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/65 to-black/10"
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
            className="size-5 shrink-0 text-[#E4D8CA] motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </li>
  );
}

/** A couch as a cinematic card: the artwork fills it, with the name, what is on and who is in it over a soft fade. */
export function CouchCard({ couch, role, memberCount, media }: CouchRoom) {
  return (
    <li>
      {/* The whole card is the link. Artwork is shown as delivered; the fade only sits under the text. */}
      <Link
        href={`/couch/${couch.id}`}
        className={cx(
          "group relative isolate flex h-full min-h-80 flex-col justify-between overflow-hidden rounded-media border border-border bg-surface p-5 text-[#F4EEE7]",
          calmTransition,
          focusRing,
        )}
      >
        <span aria-hidden="true" className="absolute inset-0 -z-10">
          <Poster
            url={media?.posterUrl ?? null}
            seed={media?.id ?? couch.id}
            name={media?.title ?? couch.name}
            bordered={false}
            monogram={false}
            className="size-full motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105"
          />
        </span>
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-linear-to-t from-black/90 via-black/65 to-black/5"
        />
        <span className="flex items-start justify-between gap-3">
          <Badge tone={role === "host" ? "primary" : "neutral"}>{role === "host" ? "Host" : "Participant"}</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs backdrop-blur-sm">
            <Users aria-hidden="true" className="size-3.5" />
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </span>
        <span className="flex items-end justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-1.5">
            <span className="line-clamp-2 break-words font-display text-2xl font-semibold leading-tight">{couch.name}</span>
            <span className="line-clamp-2 text-sm text-[#E4D8CA]">
              {media ? (
                <>
                  <span className="text-[#F4EEE7]">On the screen:</span> {media.title}
                </>
              ) : (
                "Nothing on yet"
              )}
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-6 shrink-0 text-[#E4D8CA] motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </li>
  );
}

/**
 * A public couch in discovery: the same cinematic card, marked as open to everyone rather than as the visitor's own.
 * A member gets a link into the couch ("Open couch"). A non-member gets a join button instead, and the card is not a
 * link, since a button cannot sit inside one and the couch page is for members.
 */
export function PublicCouchCard({
  id,
  name,
  memberCount,
  media,
  isMember,
}: {
  readonly id: string;
  readonly name: string;
  readonly memberCount: number;
  readonly media: { readonly title: string; readonly posterUrl: string | null } | null;
  readonly isMember: boolean;
}) {
  const cardClass = cx(
    "group relative isolate flex h-full min-h-72 flex-col justify-between overflow-hidden rounded-media border border-border bg-surface p-5 text-[#F4EEE7]",
    calmTransition,
  );
  const body = (
    <>
      <span aria-hidden="true" className="absolute inset-0 -z-10">
        <Poster
          url={media?.posterUrl ?? null}
          seed={id}
          name={media?.title ?? name}
          bordered={false}
          monogram={false}
          className="size-full motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105"
        />
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-t from-black/90 via-black/65 to-black/5"
      />
      <span className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
          <Globe aria-hidden="true" className="size-3.5" />
          Public couch
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs backdrop-blur-sm">
          <Users aria-hidden="true" className="size-3.5" />
          {memberCount} {memberCount === 1 ? "member" : "members"}
        </span>
      </span>
      <span className="flex items-end justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="line-clamp-2 break-words font-display text-2xl font-semibold leading-tight">{name}</span>
          <span className="line-clamp-2 text-sm text-[#E4D8CA]">
            {media ? (
              <>
                <span className="text-[#F4EEE7]">On the screen:</span> {media.title}
              </>
            ) : (
              "Nothing on yet"
            )}
          </span>
        </span>
        {isMember ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium">
            Open couch
            <ChevronRight
              aria-hidden="true"
              className="size-5 text-[#E4D8CA] motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
            />
          </span>
        ) : (
          <JoinPublicCouchForm couchId={id} />
        )}
      </span>
    </>
  );

  return (
    <li>
      {isMember ? (
        <Link href={`/couch/${id}`} className={cx(cardClass, focusRing)}>
          {body}
        </Link>
      ) : (
        <div className={cardClass}>{body}</div>
      )}
    </li>
  );
}
