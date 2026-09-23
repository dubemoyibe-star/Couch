import Link from "next/link";

export default function JoinCouchNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <p className="text-lg font-medium">Not found</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">This invite link is not valid.</p>
      <Link href="/" className="mt-2 text-sm underline">
        Back to my couches
      </Link>
    </div>
  );
}
