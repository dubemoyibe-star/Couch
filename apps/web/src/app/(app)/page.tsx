import { redirect } from "next/navigation";
import { getPrismaClient, listCatalogMedia } from "@couch/database";
import { FormSuccess } from "@/components/form-feedback";
import { DashboardView } from "@/components/dashboard-view";
import { loadCouchRooms } from "@/lib/couch-rooms";
import { getCurrentUser } from "@/lib/session";
import type { Metadata } from "next";

const CATALOG_ROW = 12;

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
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

  const deleted = (await searchParams).deleted === "1";

  return (
    <>
      {deleted ? (
        <div className="mx-auto w-full max-w-6xl px-6 pt-6">
          <FormSuccess message="Your couch was deleted." />
        </div>
      ) : null}
      <DashboardView
        firstName={firstName}
        rooms={rooms}
        catalogItems={catalog.items.map((item) => ({
          id: item.id,
          title: item.title,
          posterUrl: item.posterUrl ?? null,
        }))}
      />
    </>
  );
}
