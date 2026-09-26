import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe, Plus } from "lucide-react";
import { getPrismaClient } from "@couch/database";
import { CouchCard, NewCouchTile } from "@/components/couch-card";
import { NoCouchesEmptyState } from "@/components/no-couches-empty-state";
import { buttonClassName } from "@/components/ui/button";
import { loadCouchRooms } from "@/lib/couch-rooms";
import { getCurrentUser } from "@/lib/session";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "My couches" };

export default async function CouchesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const couches = await loadCouchRooms(getPrismaClient(), user.id);

  if (couches.length === 0) {
    return <NoCouchesEmptyState />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold text-text">My Couches</h1>
        <div className="flex flex-wrap gap-3">
          <Link href="/couch/create" className={buttonClassName("primary")}>
            <Plus aria-hidden="true" className="size-4" />
            Create a couch
          </Link>
          <Link href="/find-couches" className={buttonClassName("secondary")}>
            <Globe aria-hidden="true" className="size-4" />
            Find a public couch
          </Link>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {couches.map((room) => (
          <CouchCard key={room.couch.id} {...room} />
        ))}
        <NewCouchTile />
      </ul>
    </div>
  );
}
