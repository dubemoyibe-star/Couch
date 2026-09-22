import Link from "next/link";

export default function CatalogMediaNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <p className="text-lg font-medium">Not found</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This catalog item isn&apos;t available.
      </p>
      <Link href="/catalog" className="mt-2 text-sm underline">
        Back to catalog
      </Link>
    </div>
  );
}
