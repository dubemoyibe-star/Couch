import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clapperboard, Crown, Link2, Play, Plus, Sofa, Users } from "lucide-react";
import { getPrismaClient, listCouchesForUser } from "@couch/database";
import { CouchCard, NewCouchTile } from "@/components/couch-card";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { calmTransition, cx, focusRing } from "@/components/ui/cx";
import { couchMonogram, couchPosterClass } from "@/lib/couch-poster";
import { getCurrentUser } from "@/lib/session";

const RECENT_LIMIT = 5;

// A projector cone from the top-right plus a soft warm pool, pure CSS.
const heroBackdrop =
  "bg-[conic-gradient(from_195deg_at_88%_-8%,transparent_0deg,color-mix(in_oklab,var(--color-primary)_38%,transparent)_18deg,transparent_40deg),radial-gradient(60%_80%_at_0%_100%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_70%)]";

function Stat({
  icon,
  value,
  label,
}: {
  readonly icon: ReactNode;
  readonly value: number;
  readonly label: string;
}) {
  return (
    <div className="relative flex flex-col gap-4 overflow-hidden rounded-md border border-border bg-surface p-5">
      <span
        aria-hidden="true"
        className="absolute -right-8 -top-8 size-24 rounded-full bg-primary/10 blur-xl"
      />
      <span
        aria-hidden="true"
        className="relative flex size-9 items-center justify-center rounded-full border border-border bg-surface-muted text-primary"
      >
        {icon}
      </span>
      <div className="relative flex items-baseline gap-2">
        <span className="font-display text-5xl font-semibold leading-none text-text">{value}</span>
        <span className="text-sm text-text-muted">{label}</span>
      </div>
    </div>
  );
}

function Step({ n, icon, title, text }: { readonly n: number; readonly icon: ReactNode; readonly title: string; readonly text: string }) {
  return (
    <li className="flex items-start gap-4">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-primary"
      >
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="font-medium text-text">
          <span className="text-text-muted">{n}. </span>
          {title}
        </span>
        <span className="text-sm text-text-muted">{text}</span>
      </span>
    </li>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const couches = await listCouchesForUser(getPrismaClient(), user.id);

  const hosting = couches.filter((c) => c.role === "host").length;
  const people = couches.reduce((sum, c) => sum + c.memberCount, 0);
  const firstName = user.displayName.trim().split(/\s+/)[0] || user.displayName;
  const featured = couches[0];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8 sm:py-10">
      <div className="grid gap-5 lg:grid-cols-3">
        <section
          className={cx(
            "relative flex flex-col justify-between gap-10 overflow-hidden rounded-lg border border-border bg-surface p-7 sm:p-10 lg:col-span-2",
            heroBackdrop,
          )}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 400 400"
            className="absolute -bottom-32 -right-20 size-96 text-primary opacity-15"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="200" cy="200" r="80" />
            <circle cx="200" cy="200" r="130" />
            <circle cx="200" cy="200" r="180" />
          </svg>
          <div className="relative flex flex-col gap-4">
            <p className="text-sm font-medium uppercase tracking-widest text-primary">Now showing</p>
            <h1 className="font-display text-4xl font-semibold leading-tight text-text sm:text-5xl">
              Welcome back, {firstName}.
            </h1>
            <p className="max-w-lg text-base text-text-muted sm:text-lg">
              {featured
                ? "The lights are low and the seats are saved. Pick a couch and press play, together."
                : "The lights are low and the seats are empty. Start a couch, send the link, and settle in."}
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

        {featured ? (
          <Link
            href={`/couch/${featured.couch.id}`}
            className={cx(
              "group relative flex min-h-64 flex-col justify-end gap-3 overflow-hidden rounded-lg border border-border p-6",
              couchPosterClass(featured.couch.id),
              calmTransition,
              focusRing,
            )}
          >
            <span
              aria-hidden="true"
              className="absolute -right-4 -top-10 font-display text-[10rem] font-semibold leading-none text-text/15 motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-105"
            >
              {couchMonogram(featured.couch.name)}
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-linear-to-t from-background/90 via-background/30 to-transparent"
            />
            <span className="relative flex flex-col gap-3">
              <Badge tone={featured.role === "host" ? "primary" : "neutral"} className="self-start">
                Jump back in
              </Badge>
              <span className="font-display text-3xl font-semibold leading-tight text-text">
                {featured.couch.name}
              </span>
              <span className="flex items-center justify-between text-sm text-text">
                <span className="inline-flex items-center gap-1.5">
                  <Users aria-hidden="true" className="size-4" />
                  {featured.memberCount} {featured.memberCount === 1 ? "member" : "members"}
                </span>
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground motion-safe:transition-transform group-hover:scale-110">
                  <Play aria-hidden="true" className="size-4 fill-current" />
                  <span className="sr-only">Open couch</span>
                </span>
              </span>
            </span>
          </Link>
        ) : (
          <section
            aria-label="How it works"
            className="flex flex-col justify-center gap-6 rounded-lg border border-border bg-surface p-7"
          >
            <h2 className="font-display text-2xl font-semibold text-text">Movie night in three steps</h2>
            <ol className="flex flex-col gap-5">
              <Step n={1} icon={<Sofa className="size-5" />} title="Create a couch" text="A private room for your crew." />
              <Step n={2} icon={<Link2 className="size-5" />} title="Share the link" text="Friends join with one click." />
              <Step n={3} icon={<Play className="size-5" />} title="Press play" text="Everyone stays in sync." />
            </ol>
          </section>
        )}
      </div>

      {featured ? (
        <>
          <section aria-label="Your couches at a glance" className="grid grid-cols-3 gap-3 sm:gap-5">
            <Stat icon={<Sofa className="size-4" />} value={couches.length} label={couches.length === 1 ? "couch" : "couches"} />
            <Stat icon={<Crown className="size-4" />} value={hosting} label="hosting" />
            <Stat icon={<Users className="size-4" />} value={people} label={people === 1 ? "seat" : "seats"} />
          </section>

          <section aria-labelledby="recent-couches" className="flex flex-col gap-5">
            <div className="flex items-end justify-between gap-4">
              <h2 id="recent-couches" className="font-display text-2xl font-semibold text-text sm:text-3xl">
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
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {couches.slice(0, RECENT_LIMIT).map(({ couch, role, memberCount }) => (
                <CouchCard key={couch.id} id={couch.id} name={couch.name} role={role} memberCount={memberCount} />
              ))}
              <NewCouchTile />
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
