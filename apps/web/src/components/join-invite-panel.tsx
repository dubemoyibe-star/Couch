import Link from "next/link";
import { Users } from "lucide-react";
import { JoinCouchForm } from "@/app/(app)/join/[code]/join-couch-form";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import { couchMonogram, couchPosterClass } from "@/lib/couch-poster";

/**
 * The invite confirmation: a warm banner with the couch's monogram, who is
 * already in, and the Join button. Shared by the full page and the modal;
 * `showCancel` adds a way back for the page, which has no close control.
 */
export function JoinInvitePanel({
  couchName,
  memberCount,
  inviteCode,
  showCancel = false,
}: {
  readonly couchName: string;
  readonly memberCount: number;
  readonly inviteCode: string;
  readonly showCancel?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <div
        aria-hidden="true"
        className={cx(
          "relative flex h-36 items-center justify-center overflow-hidden border-b border-border",
          couchPosterClass(couchName),
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(60%_90%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_35%,transparent),transparent_75%)]" />
        <span className="relative flex size-20 items-center justify-center rounded-full border border-border bg-surface/80 font-display text-4xl font-semibold text-text shadow-lg backdrop-blur-sm">
          {couchMonogram(couchName)}
        </span>
      </div>
      <div className="flex flex-col items-center gap-5 p-6 text-center sm:p-8">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-text-muted">You&apos;ve been invited to</p>
          <h1 id="join-couch-title" className="font-display text-3xl font-semibold leading-tight text-text">
            {couchName}
          </h1>
          <p className="inline-flex items-center gap-1.5 text-sm text-text-muted">
            <Users aria-hidden="true" className="size-4" />
            {memberCount} {memberCount === 1 ? "member" : "members"} already on the couch
          </p>
        </div>
        <JoinCouchForm inviteCode={inviteCode} />
        {showCancel ? (
          <Link
            href="/"
            className={cx(
              "rounded-sm text-sm text-text-muted underline underline-offset-4 hover:text-text",
              calmTransition,
              focusRing,
            )}
          >
            Not now
          </Link>
        ) : null}
      </div>
    </div>
  );
}
