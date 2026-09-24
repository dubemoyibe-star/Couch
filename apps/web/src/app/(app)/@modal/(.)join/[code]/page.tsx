import { redirect } from "next/navigation";
import { getCouchByInviteCode, getMembership, getPrismaClient, listMembers } from "@couch/database";
import { JoinInvitePanel } from "@/components/join-invite-panel";
import { ModalDialog } from "@/components/modal-dialog";
import { getCurrentUser } from "@/lib/session";

// Soft navigation to /join/<code> (pasting a link into "Join a couch") opens
// the confirmation over the current page. Opening an invite link directly, or
// refreshing, renders the full page instead.
export default async function JoinCouchModal({ params }: PageProps<"/join/[code]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { code } = await params;
  const db = getPrismaClient();
  const couch = await getCouchByInviteCode(db, code);

  if (!couch) {
    return (
      <ModalDialog labelledBy="join-couch-title" className="p-8 text-center">
        <h1 id="join-couch-title" className="font-display text-2xl font-semibold text-text">
          Invite not valid
        </h1>
        <p className="mt-2 text-sm text-text-muted">Check the link with whoever invited you.</p>
      </ModalDialog>
    );
  }

  const membership = await getMembership(db, { couchId: couch.id, userId: user.id });
  if (membership) redirect(`/couch/${couch.id}`);

  const members = await listMembers(db, couch.id);

  return (
    <ModalDialog labelledBy="join-couch-title">
      <JoinInvitePanel couchName={couch.name} memberCount={members.length} inviteCode={code} />
    </ModalDialog>
  );
}
