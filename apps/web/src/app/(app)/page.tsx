import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrismaClient, listCouchesForUser } from "@couch/database";
import { getCurrentUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const db = getPrismaClient();
  const couches = await listCouchesForUser(db, user.id);

  if (couches.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
        <p className="text-lg font-medium">No couches yet</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Couches you create or join will show up here.
        </p>
        <Link href="/couch/create" className="mt-2 text-sm underline">
          Create a couch
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">My Couches</h1>
        <Link href="/couch/create" className="text-sm underline">
          Create a couch
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {couches.map(({ couch, role, memberCount }) => (
          <li key={couch.id}>
            <Link
              href={`/couch/${couch.id}`}
              className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <span className="font-medium">{couch.name}</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {role} · {memberCount} {memberCount === 1 ? "member" : "members"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
