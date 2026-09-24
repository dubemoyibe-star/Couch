import Link from "next/link";
import { redirect } from "next/navigation";
import { Armchair } from "lucide-react";
import { getPrismaClient, listCouchesForUser } from "@couch/database";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buttonClassName } from "@/components/ui/button";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import { getCurrentUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const db = getPrismaClient();
  const couches = await listCouchesForUser(db, user.id);

  if (couches.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <Card as="section" className="flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full border border-border bg-surface-muted text-primary"
          >
            <Armchair className="size-6" />
          </span>
          <h1 className="font-display text-2xl font-semibold text-text">Your couch is waiting</h1>
          <p className="text-text-muted">
            Start a couch to watch together, or open an invite link from a friend to join theirs.
          </p>
          <Link href="/couch/create" className={buttonClassName("primary", "mt-2")}>
            Create a couch
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold text-text">My Couches</h1>
        <Link href="/couch/create" className={buttonClassName("primary")}>
          Create a couch
        </Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {couches.map(({ couch, role, memberCount }) => (
          <Card as="li" key={couch.id} className="p-0">
            <Link
              href={`/couch/${couch.id}`}
              className={cx(
                "flex h-full flex-col gap-4 rounded-md p-5 hover:bg-surface-muted",
                calmTransition,
                focusRing,
              )}
            >
              <span className="font-display text-xl font-semibold text-text">{couch.name}</span>
              <span className="flex items-center gap-3 text-sm text-text-muted">
                <Badge tone={role === "host" ? "primary" : "neutral"}>
                  {role === "host" ? "Host" : "Participant"}
                </Badge>
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </span>
            </Link>
          </Card>
        ))}
      </ul>
    </div>
  );
}
