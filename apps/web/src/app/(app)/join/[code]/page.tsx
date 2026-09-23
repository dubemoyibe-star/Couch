import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCouchByInviteCode, getMembership, getPrismaClient } from "@couch/database";
import { getCurrentUser } from "@/lib/session";
import { JoinCouchForm } from "./join-couch-form";

export default async function JoinCouchPage({ params }: PageProps<"/join/[code]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { code } = await params;
  const db = getPrismaClient();
  const couch = await getCouchByInviteCode(db, code);
  if (!couch) notFound();

  const membership = await getMembership(db, { couchId: couch.id, userId: user.id });
  if (membership) redirect(`/couch/${couch.id}`);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="text-lg font-medium">Join {couch.name}?</p>
      <JoinCouchForm inviteCode={code} />
      <Link href="/" className="text-sm underline">
        Cancel
      </Link>
    </div>
  );
}
