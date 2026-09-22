import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCatalogMedia, getPrismaClient } from "@couch/database";
import { getCurrentUser } from "@/lib/session";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <Link href={backHref} className="text-sm underline">
        Back to catalog
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row">
        {media.posterUrl ? (
          <img
            src={media.posterUrl}
            alt=""
            className="aspect-[2/3] w-full max-w-xs rounded object-cover"
          />
        ) : (
          <div className="flex aspect-[2/3] w-full max-w-xs items-center justify-center rounded bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            No poster
          </div>
        )}

        <div className="flex flex-1 flex-col gap-4">
          <div>
            <h1 className="text-xl font-medium">{media.title}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {[
                media.releaseYear ?? null,
                media.durationSeconds !== null ? formatDuration(media.durationSeconds) : null,
              ]
                .filter((value) => value !== null)
                .join(" · ")}
            </p>
          </div>

          {media.description ? <p>{media.description}</p> : null}

          <div className="flex flex-col gap-1 rounded border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <h2 className="font-medium">License</h2>
            {license.attributionRequired && license.attribution ? (
              <p>{license.attribution}</p>
            ) : null}
            <p>
              {license.licenseName}
              {license.licenseVersion ? ` ${license.licenseVersion}` : ""}
            </p>
            <a
              href={license.licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              View license
            </a>
            <a
              href={license.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              View source
            </a>
          </div>

          {/* "Use this for my couch" action does not exist yet; it lands in Issue 11. */}
        </div>
      </div>
    </div>
  );
}
