import Link from "next/link";
import { redirect } from "next/navigation";
import { Armchair, Plus } from "lucide-react";
import { getPrismaClient, listCouchesForUser } from "@couch/database";
import { CouchCard, NewCouchTile } from "@/components/couch-card";
import { Card } from "@/components/ui/card";
import { buttonClassName } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

export default async function CouchesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const couches = await listCouchesForUser(getPrismaClient(), user.id);

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
            <Plus aria-hidden="true" className="size-4" />
            Create a couch
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold text-text">My Couches</h1>
        <Link href="/couch/create" className={buttonClassName("primary")}>
          <Plus aria-hidden="true" className="size-4" />
          Create a couch
        </Link>
      </div>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {couches.map(({ couch, role, memberCount }) => (
          <CouchCard key={couch.id} id={couch.id} name={couch.name} role={role} memberCount={memberCount} />
        ))}
        <NewCouchTile />
      </ul>
    </div>
  );
}
