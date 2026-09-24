import { notFound, redirect } from "next/navigation";
import { getCouchByInviteCode, getMembership, getPrismaClient, listMembers } from "@couch/database";
import { getCurrentUser } from "@/lib/session";
import { JoinInvitePanel } from "@/components/join-invite-panel";
import { Card } from "@/components/ui/card";

export default async function JoinCouchPage({ params }: PageProps<"/join/[code]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { code } = await params;
  const db = getPrismaClient();
  const couch = await getCouchByInviteCode(db, code);
  if (!couch) notFound();

  const membership = await getMembership(db, { couchId: couch.id, userId: user.id });
  if (membership) redirect(`/couch/${couch.id}`);

  const members = await listMembers(db, couch.id);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <Card as="section" className="w-full max-w-md overflow-hidden p-0!">
        <JoinInvitePanel couchName={couch.name} memberCount={members.length} inviteCode={code} showCancel />
      </Card>
    </div>
  );
}
