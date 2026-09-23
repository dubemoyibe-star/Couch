import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCatalogMedia, getCouch, getMembership, getPrismaClient, listMembers } from "@couch/database";
import { getCurrentUser } from "@/lib/session";
import { getBaseUrl } from "@/lib/base-url";
import { CopyInviteLink } from "@/components/copy-invite-link";
import { SetCurrentMediaForm } from "@/components/set-current-media-form";

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
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
        <p className="text-lg font-medium">You&apos;re not a member of {couch.name}</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ask whoever invited you for the invite link to join.
        </p>
        <Link href="/" className="mt-2 text-sm underline">
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

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-medium">{couch.name}</h1>

      {inviteUrl ? <CopyInviteLink url={inviteUrl} /> : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Now watching</h2>
        {currentMedia ? (
          <div className="flex flex-col gap-2 rounded border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="font-medium">{currentMedia.title}</span>
                {currentMedia.license.attributionRequired ? (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {currentMedia.license.attribution}
                  </span>
                ) : null}
              </div>
              <Link href={`/catalog/${currentMedia.id}`} className="text-sm underline">
                View details
              </Link>
            </div>
            {isHost ? (
              <div className="flex items-center gap-4">
                <Link href={`/catalog?forCouch=${couch.id}`} className="text-sm underline">
                  Change
                </Link>
                <SetCurrentMediaForm couchId={couch.id}>Stop watching</SetCurrentMediaForm>
              </div>
            ) : null}
          </div>
        ) : currentMediaUnavailable ? (
          <div className="flex flex-col gap-2 rounded border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              The previously selected item is no longer available.
            </p>
            {isHost ? (
              <Link href={`/catalog?forCouch=${couch.id}`} className="text-sm underline">
                Pick something else
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No media selected yet.</p>
            {isHost ? (
              <Link href={`/catalog?forCouch=${couch.id}`} className="text-sm underline">
                Search the catalog
              </Link>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Members</h2>
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 dark:border-zinc-800"
            >
              <span>{member.displayName}</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{member.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
