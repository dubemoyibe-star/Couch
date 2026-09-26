import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";

/**
 * Shown in place of the invite confirmation when the invite resolves to a
 * couch the host has closed. This is messaging only: `joinCouch` enforces
 * the closure on the server.
 */
export function ClosedCouchNotice({
  couchName,
  showBack = false,
}: {
  readonly couchName: string;
  readonly showBack?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <h1 id="join-couch-title" className="max-w-full break-words font-display text-2xl font-semibold text-text">
        {couchName} isn&apos;t accepting new members right now
      </h1>
      <p className="text-sm text-text-muted">The host has closed this couch. Ask them to reopen it, then try the link again.</p>
      {showBack ? (
        <Link href="/" className={buttonClassName("secondary", "mt-4")}>
          Back to my couches
        </Link>
      ) : null}
    </div>
  );
}
