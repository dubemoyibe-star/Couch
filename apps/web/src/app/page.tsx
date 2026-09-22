import { getCurrentUser } from "@/lib/session";
import { signOutAction } from "@/app/sign-out/actions";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <p>Signed in as {user?.displayName ?? user?.email}</p>
      <form action={signOutAction}>
        <button type="submit" className="underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
