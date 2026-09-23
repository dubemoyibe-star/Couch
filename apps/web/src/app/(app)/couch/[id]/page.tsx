import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCouch, getMembership, getPrismaClient, listMembers } from "@couch/database";
import { getCurrentUser } from "@/lib/session";
import { getBaseUrl } from "@/lib/base-url";
import { CopyInviteLink } from "@/components/copy-invite-link";

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

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-medium">{couch.name}</h1>

      {inviteUrl ? <CopyInviteLink url={inviteUrl} /> : null}

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
