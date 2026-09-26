import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCatalogMedia, getCouch, getMembership, getPrismaClient, listMembers } from "@couch/database";
import { getCurrentUser } from "@/lib/session";
import { getBaseUrl } from "@/lib/base-url";
import { ArrowLeftRight, Square, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import { CopyInviteLink } from "@/components/copy-invite-link";
import { SetCurrentMediaForm } from "@/components/set-current-media-form";
import { RemoveMemberForm } from "@/components/remove-member-form";
import { CouchVisibilityForm } from "@/components/couch-visibility-form";
import { CouchClosedForm } from "@/components/couch-closed-form";
import { LeaveCouchForm } from "@/components/leave-couch-form";
import { NoMediaEmptyState } from "@/components/no-media-empty-state";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Your couch" };

export default async function CouchPage({ params }: PageProps<"/couch/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;
  const db = getPrismaClient();
  const couch = await getCouch(db, id);
  if (!couch) notFound();

  const membership = await getMembership(db, { couchId: couch.id, userId: user.id });

  // A signed-in non-member sees the couch name (couch ids are unguessable
  // UUIDs, so this is not an enumeration risk, and it lets someone confirm
  // they have the right couch before asking for an invite) but never the
  // member list or current media: those are internals for members only.
  if (!membership) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <h1 className="max-w-full break-words font-display text-2xl font-semibold text-text">
          You&apos;re not a member of {couch.name}
        </h1>
        <p className="text-text-muted">Ask whoever invited you for the invite link to join.</p>
        <Link href="/" className={buttonClassName("secondary", "mt-4")}>
          Back to my couches
        </Link>
      </div>
    );
  }

  const members = await listMembers(db, couch.id);
  const isHost = membership.role === "host";
  const inviteUrl = isHost ? `${getBaseUrl()}/join/${couch.inviteCode}` : null;

  // `couch.currentMediaId` can point at media that has since been taken
  // down (the row is deactivated, not deleted), so it is never trusted
  // directly: it is always re-resolved through `getCatalogMedia`, which
  // returns null for a takedown the same as for an id that never existed.
  const currentMedia = couch.currentMediaId
    ? await getCatalogMedia(db, couch.currentMediaId, {
        onExcluded: (exclusion) => {
          console.error(`couch/[id]: excluded ${exclusion.id} (${exclusion.reason})`);
        },
      })
    : null;
  const currentMediaUnavailable = couch.currentMediaId !== null && currentMedia === null;

  const secondaryLink = cx(
    "inline-flex min-h-11 items-center rounded-sm text-sm text-text-muted underline underline-offset-4 hover:text-text",
    calmTransition,
    focusRing,
  );
  const pickHref = `/catalog?forCouch=${couch.id}`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="break-words font-display text-3xl font-semibold text-text sm:text-4xl">{couch.name}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-muted">
          <Badge tone={isHost ? "primary" : "neutral"}>{isHost ? "Host" : "Participant"}</Badge>
          <span className="inline-flex items-center gap-1.5">
            <Users aria-hidden="true" className="size-4" />
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
        </p>
      </header>

      <section aria-labelledby="now-watching" className="flex flex-col gap-3">
        <h2 id="now-watching" className="text-sm font-medium uppercase tracking-wide text-text-muted">
          Now watching
        </h2>
        {currentMedia ? (
          <Card className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-stretch">
            {/* Artwork is shown as delivered: no filter, tint, or overlay. */}
            {currentMedia.posterUrl ? (
              // Provider-hosted artwork from arbitrary hosts, so next/image's host allowlist does not fit.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentMedia.posterUrl}
                alt=""
                className="aspect-[2/3] w-44 shrink-0 rounded-media object-cover shadow-lg"
              />
            ) : (
              <div className="flex aspect-[2/3] w-44 shrink-0 items-center justify-center rounded-media border border-border bg-surface-muted text-sm text-text-muted">
                No poster
              </div>
            )}
            <div className="flex w-full flex-1 flex-col justify-between gap-6 text-center sm:text-left">
              <div className="flex flex-col items-center gap-2 sm:items-start">
                <p className="break-words font-display text-2xl font-semibold text-text sm:text-3xl">{currentMedia.title}</p>
                <Link href={`/catalog/${currentMedia.id}`} className={cx(secondaryLink, "self-start")}>
                  View details
                </Link>
              </div>
              {isHost ? (
                <div className="flex flex-wrap items-start justify-center gap-3 sm:justify-start">
                  <Link href={pickHref} className={buttonClassName("secondary", "px-5")}>
                    <ArrowLeftRight aria-hidden="true" className="size-4" />
                    Change
                  </Link>
                  <SetCurrentMediaForm
                    couchId={couch.id}
                    variant="secondary"
                    confirm={{
                      title: "Stop watching?",
                      description: "This clears what is on the screen for everyone. You can pick something again at any time.",
                      confirmLabel: "Stop watching",
                    }}
                  >
                    <Square aria-hidden="true" className="size-4" />
                    Stop watching
                  </SetCurrentMediaForm>
                </div>
              ) : null}
            </div>
          </Card>
        ) : currentMediaUnavailable ? (
          <Card className="flex flex-col items-start gap-3">
            <p className="text-text-muted">The previously selected item is no longer available.</p>
            {isHost ? (
              <Link href={pickHref} className={buttonClassName("secondary", "min-h-10 px-4")}>
                Pick something else
              </Link>
            ) : null}
          </Card>
        ) : (
          <NoMediaEmptyState isHost={isHost} pickHref={pickHref} />
        )}
      </section>

      <section aria-labelledby="members" className="flex flex-col gap-3">
        <h2 id="members" className="text-sm font-medium uppercase tracking-wide text-text-muted">
          Members
        </h2>
        <Card as="section" className="p-0">
          <ul className="divide-y divide-border">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={member.displayName} />
                <span className="truncate text-text">{member.displayName}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <Badge tone={member.role === "host" ? "primary" : "neutral"}>
                  {member.role === "host" ? "Host" : "Participant"}
                </Badge>
                {isHost && member.role !== "host" ? (
                  <RemoveMemberForm
                    couchId={couch.id}
                    targetUserId={member.userId}
                    memberName={member.displayName}
                  />
                ) : null}
              </span>
            </li>
          ))}
          </ul>
        </Card>
      </section>

      {inviteUrl || !isHost ? (
        <Card as="section" className="flex flex-col gap-5">
          {inviteUrl ? <CopyInviteLink url={inviteUrl} /> : null}
          {isHost ? <CouchVisibilityForm key={`public-${couch.isPublic}`} couchId={couch.id} isPublic={couch.isPublic} /> : null}
          {isHost ? <CouchClosedForm key={`closed-${couch.isClosed}`} couchId={couch.id} isClosed={couch.isClosed} /> : null}
          {!isHost ? <LeaveCouchForm couchId={couch.id} /> : null}
        </Card>
      ) : null}
    </div>
  );
}
