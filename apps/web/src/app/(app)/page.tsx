import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clapperboard, Crown, Plus, Sofa, Users } from "lucide-react";
import { getPrismaClient, listCouchesForUser } from "@couch/database";
import { CouchCard } from "@/components/couch-card";
import { Card } from "@/components/ui/card";
import { buttonClassName } from "@/components/ui/button";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import { getCurrentUser } from "@/lib/session";

const RECENT_LIMIT = 4;

const heroGlow =
  "bg-[radial-gradient(70%_120%_at_15%_0%,color-mix(in_oklab,var(--color-primary)_30%,transparent),transparent_65%),radial-gradient(50%_90%_at_100%_100%,color-mix(in_oklab,var(--color-primary)_14%,transparent),transparent_70%)]";

function Stat({ icon, value, label }: { readonly icon: ReactNode; readonly value: number; readonly label: string }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-primary"
      >
        {icon}
      </span>
      <div className="flex flex-col">
        <span className="font-display text-3xl font-semibold leading-none text-text">{value}</span>
        <span className="mt-1.5 text-sm text-text-muted">{label}</span>
      </div>
    </Card>
  );
}

function ActionCard({
  href,
  icon,
  title,
  text,
}: {
  readonly href: string;
  readonly icon: ReactNode;
  readonly title: string;
  readonly text: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "group flex items-center gap-4 rounded-md border border-border bg-surface p-5 hover:bg-surface-muted",
        calmTransition,
        focusRing,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        {icon}
      </span>
      <span className="flex flex-1 flex-col">
        <span className="font-medium text-text">{title}</span>
        <span className="text-sm text-text-muted">{text}</span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="size-5 text-text-muted motion-safe:transition-transform group-hover:translate-x-0.5 group-hover:text-text"
      />
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const couches = await listCouchesForUser(getPrismaClient(), user.id);

  const hosting = couches.filter((c) => c.role === "host").length;
  const people = couches.reduce((sum, c) => sum + c.memberCount, 0);
  const firstName = user.displayName.trim().split(/\s+/)[0] || user.displayName;
  const empty = couches.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10">
      <section
        className={cx(
          "relative flex flex-col gap-5 overflow-hidden rounded-lg border border-border bg-surface p-6 sm:p-10",
          heroGlow,
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 400 400"
          className="absolute -bottom-24 -right-16 size-80 text-primary opacity-20"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="200" cy="200" r="80" />
          <circle cx="200" cy="200" r="130" />
          <circle cx="200" cy="200" r="180" />
        </svg>
        <div className="relative flex flex-col gap-2">
          <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">
            Welcome back, {firstName}
          </h1>
          <p className="max-w-xl text-text-muted sm:text-lg">
            {empty
              ? "Your couch is waiting. Start one, send the link, and settle in."
              : "Settle in. Pick up where you left off, or start something new."}
          </p>
        </div>
        <div className="relative flex flex-wrap gap-3">
          <Link href="/couch/create" className={buttonClassName("primary")}>
            <Plus aria-hidden="true" className="size-4" />
            Create a couch
          </Link>
          <Link href="/catalog" className={buttonClassName("secondary")}>
            <Clapperboard aria-hidden="true" className="size-4" />
            Browse the catalog
          </Link>
        </div>
      </section>

      {empty ? (
        <section aria-label="Getting started" className="grid gap-4 sm:grid-cols-2">
          <ActionCard
            href="/couch/create"
            icon={<Sofa className="size-5" />}
            title="Create your first couch"
            text="A private room for you and your friends."
          />
          <ActionCard
            href="/catalog"
            icon={<Clapperboard className="size-5" />}
            title="See what you can watch"
            text="Browse the catalog and pick something."
          />
        </section>
      ) : (
        <>
          <section aria-label="Your couches at a glance" className="grid gap-4 sm:grid-cols-3">
            <Stat icon={<Sofa className="size-5" />} value={couches.length} label={couches.length === 1 ? "Couch" : "Couches"} />
            <Stat icon={<Crown className="size-5" />} value={hosting} label="Hosting" />
            <Stat icon={<Users className="size-5" />} value={people} label={people === 1 ? "Seat filled" : "Seats filled"} />
          </section>

          <section aria-labelledby="recent-couches" className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h2 id="recent-couches" className="font-display text-2xl font-semibold text-text">
                Your couches
              </h2>
              <Link
                href="/couches"
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary hover:text-primary-hover",
                  focusRing,
                )}
              >
                View all
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {couches.slice(0, RECENT_LIMIT).map(({ couch, role, memberCount }) => (
                <CouchCard key={couch.id} id={couch.id} name={couch.name} role={role} memberCount={memberCount} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
