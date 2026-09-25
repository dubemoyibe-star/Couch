import { redirect } from "next/navigation";
import { getPrismaClient, listCatalogMedia } from "@couch/database";
import { DashboardView } from "@/components/dashboard-view";
import { loadCouchRooms } from "@/lib/couch-rooms";
import { getCurrentUser } from "@/lib/session";
import type { Metadata } from "next";

const CATALOG_ROW = 12;

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const db = getPrismaClient();
  const [rooms, catalog] = await Promise.all([
    loadCouchRooms(db, user.id),
    listCatalogMedia(db, {
      limit: CATALOG_ROW,
      onExcluded: (exclusion) => {
        console.error(`dashboard: excluded ${exclusion.id} (${exclusion.reason})`);
      },
    }),
  ]);

  const firstName = user.displayName.trim().split(/\s+/)[0] || user.displayName;

  return (
    <DashboardView
      firstName={firstName}
      rooms={rooms}
      catalogItems={catalog.items.map((item) => ({
        id: item.id,
        title: item.title,
        posterUrl: item.posterUrl ?? null,
      }))}
    />
  );
}
