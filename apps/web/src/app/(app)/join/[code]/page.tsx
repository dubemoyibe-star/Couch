import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCouchByInviteCode, getMembership, getPrismaClient } from "@couch/database";
import { getCurrentUser } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
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
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <Card as="section" className="flex w-full max-w-md flex-col gap-6 p-6 text-center sm:p-8">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-text-muted">You&apos;ve been invited to</p>
          <h1 className="font-display text-2xl font-semibold text-text">{couch.name}</h1>
        </div>
        <JoinCouchForm inviteCode={code} />
        <Link href="/" className={cx("self-center rounded-sm text-sm text-text-muted underline underline-offset-4 hover:text-text", calmTransition, focusRing)}>
          Cancel
        </Link>
      </Card>
    </div>
  );
}
