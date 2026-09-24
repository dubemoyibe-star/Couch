import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";

export default function JoinCouchNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <h1 className="font-display text-2xl font-semibold text-text">Not found</h1>
      <p className="text-text-muted">This invite link is not valid.</p>
      <Link href="/" className={buttonClassName("secondary", "mt-4")}>
        Back to my couches
      </Link>
    </div>
  );
}
