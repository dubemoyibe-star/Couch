import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCatalogMedia, getCouch, getMembership, getPrismaClient } from "@couch/database";
import { getCurrentUser } from "@/lib/session";
import { SetCurrentMediaForm } from "@/components/set-current-media-form";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const licenseLink = cx(
  "rounded-sm underline underline-offset-4 hover:text-text",
  calmTransition,
  focusRing,
);

function formatDuration(durationSeconds: number): string {
  const totalSeconds = Math.round(durationSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

export default async function CatalogMediaPage({
  params,
  searchParams,
}: PageProps<"/catalog/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;
  const search = await searchParams;
  const back = firstParam(search.back);
  const backHref = back && back.startsWith("/catalog") ? back : "/catalog";

  const db = getPrismaClient();

  // Picking-for-a-couch mode, re-checked independently from this page's own
  // query string rather than trusted from wherever the link came from: only
  // turned on when `forCouch` names a couch the signed-in user actually
  // hosts.
  const forCouchParam = firstParam(search.forCouch);
  let pickingForCouchId: string | null = null;
  if (forCouchParam) {
    const forCouch = await getCouch(db, forCouchParam);
    const forCouchMembership = forCouch
      ? await getMembership(db, { couchId: forCouch.id, userId: user.id })
      : null;
    if (forCouch && forCouchMembership?.role === "host") {
      pickingForCouchId = forCouch.id;
    }
  }

  // getCatalogMedia does not distinguish "doesn't exist" from "exists but is
  // unauthorized, inactive, or malformed" to a caller by design (docs/LICENSING.md),
  // so every one of those cases renders the same not-found state here.
  const media = await getCatalogMedia(db, id, {
    onExcluded: (exclusion) => {
      console.error(`catalog/[id]: excluded ${exclusion.id} (${exclusion.reason})`);
    },
  });
  if (!media) notFound();

  const { license } = media;

  const meta = [
    media.releaseYear ?? null,
    media.durationSeconds !== null ? formatDuration(media.durationSeconds) : null,
  ].filter((value) => value !== null);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href={backHref}
        className={cx(
          "inline-flex items-center gap-1.5 self-start rounded-sm text-sm text-text-muted hover:text-text",
          calmTransition,
          focusRing,
        )}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to catalog
      </Link>

      <div className="grid gap-8 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-12">
        {/* Artwork is shown as delivered: no filter, tint, or overlay. */}
        {media.posterUrl ? (
          <img
            src={media.posterUrl}
            alt=""
            className="aspect-[2/3] w-full max-w-xs rounded-media object-cover shadow-lg"
          />
        ) : (
          <div className="flex aspect-[2/3] w-full max-w-xs items-center justify-center rounded-media border border-border bg-surface-muted text-sm text-text-muted">
            No poster
          </div>
        )}

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">{media.title}</h1>
            {meta.length > 0 ? <p className="text-text-muted">{meta.join(" · ")}</p> : null}
          </div>

          {media.description ? (
            <p className="max-w-prose leading-relaxed text-text">{media.description}</p>
          ) : null}

          {pickingForCouchId ? (
            <SetCurrentMediaForm couchId={pickingForCouchId} mediaId={media.id}>
              Set as couch&apos;s current media
            </SetCurrentMediaForm>
          ) : null}

          {/* Rights information stays available and legible, but reads as a credit line, not a panel. */}
          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-4 text-xs text-text-muted">
            {license.attributionRequired && license.attribution ? <p>{license.attribution}</p> : null}
            <p className="flex flex-wrap items-center gap-x-2">
              <span>
                {license.licenseName}
                {license.licenseVersion ? ` ${license.licenseVersion}` : ""}
              </span>
              <span aria-hidden="true">·</span>
              <a href={license.licenseUrl} target="_blank" rel="noopener noreferrer" className={licenseLink}>
                License<span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span aria-hidden="true">·</span>
              <a href={license.sourceUrl} target="_blank" rel="noopener noreferrer" className={licenseLink}>
                Source<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
