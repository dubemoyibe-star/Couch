import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { signOutAction } from "@/app/sign-out/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Couch</span>
          <Link href="/" className="text-sm underline">
            My Couches
          </Link>
          <Link href="/catalog" className="text-sm underline">
            Catalog
          </Link>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {user.displayName}
            </span>
          ) : null}
          <form action={signOutAction}>
            <button type="submit" className="text-sm underline">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
