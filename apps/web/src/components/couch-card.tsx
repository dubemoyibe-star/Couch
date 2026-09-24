import Link from "next/link";
import { Armchair } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";

export type CouchCardProps = {
  readonly id: string;
  readonly name: string;
  readonly role: "host" | "participant";
  readonly memberCount: number;
};

/** One couch as a card. The link inside owns the boundary and focus treatment. */
export function CouchCard({ id, name, role, memberCount }: CouchCardProps) {
  return (
    <Card as="li" className="p-0">
      <Link
        href={`/couch/${id}`}
        className={cx(
          "group flex h-full items-center gap-4 rounded-md p-5 hover:bg-surface-muted",
          calmTransition,
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-primary group-hover:bg-surface"
        >
          <Armchair className="size-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="truncate font-display text-xl font-semibold text-text">{name}</span>
          <span className="flex items-center gap-3 text-sm text-text-muted">
            <Badge tone={role === "host" ? "primary" : "neutral"}>
              {role === "host" ? "Host" : "Participant"}
            </Badge>
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </span>
      </Link>
    </Card>
  );
}
