import Link from "next/link";
import { Film } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonClassName } from "@/components/ui/button";

export default function CatalogMediaNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Card as="section" className="flex w-full max-w-md flex-col items-center gap-3 p-8 text-center">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full border border-border bg-surface-muted text-primary"
        >
          <Film className="size-6" />
        </span>
        <h1 className="font-display text-2xl font-semibold text-text">Not found</h1>
        <p className="text-text-muted">This catalog item isn&apos;t available.</p>
        <Link href="/catalog" className={buttonClassName("secondary", "mt-2")}>
          Back to catalog
        </Link>
      </Card>
    </div>
  );
}
