import type { ReactNode } from "react";
import { MonitorPlay, RefreshCw, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { StatusIcon } from "@/components/ui/status-icon";
import { cx, focusRing } from "@/components/ui/cx";

/** Link styling shared by the auth screens. */
export const authLinkClass = cx(
  "rounded-sm font-medium text-primary underline underline-offset-4 hover:text-primary-hover",
  focusRing,
);

/**
 * Link styling for a link inside a sentence beside a form. It keeps the underline: the accent
 * color is under 3:1 against the surrounding muted text, so color alone would not mark it as a link.
 */
export const authQuietLinkClass = cx(
  "rounded-sm font-medium text-primary underline underline-offset-4 hover:text-primary-hover",
  focusRing,
);

// A warm glow at the top of the page so the background is not flat.
const backdrop =
  "bg-[radial-gradient(60%_45%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_20%,transparent),transparent_70%)]";

/** Full-width buttons with a pointer cursor (a progress cursor while busy), for the auth screens. */
export const authButtonClass = "w-full cursor-pointer aria-busy:cursor-progress";

function IconBadge({ children }: { readonly children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-12 items-center justify-center rounded-full border border-border bg-surface-muted text-primary"
    >
      {children}
    </span>
  );
}

/** Centered card with the logo, an icon and a heading, for the single-purpose auth screens. */
export function AuthShell({
  title,
  icon,
  children,
}: {
  readonly title: string;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <main
      className={cx("flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12", backdrop)}
    >
      <Logo size={30} />
      <Card as="section" className="flex w-full max-w-md flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {icon ? <IconBadge>{icon}</IconBadge> : null}
          <h1 className="font-display text-2xl font-semibold text-text">{title}</h1>
        </div>
        {children}
      </Card>
    </main>
  );
}

const highlights = [
  { icon: <MonitorPlay aria-hidden="true" className="size-5" />, text: "Pick something to watch together" },
  { icon: <RefreshCw aria-hidden="true" className="size-5" />, text: "Stay in sync, wherever you are" },
  { icon: <Users aria-hidden="true" className="size-5" />, text: "Invite friends with a single link" },
] as const;

/** Two-column layout for sign-in and sign-up: brand panel on the left, form on the right. */
export function AuthSplit({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-1">
      <aside className="relative hidden w-1/2 max-w-[44rem] flex-col justify-between overflow-hidden border-r border-border bg-surface-muted p-12 lg:flex">
        {/* Projector-beam glow and soft rings; pure CSS and SVG, no image is shipped. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(70%_55%_at_20%_15%,color-mix(in_oklab,var(--color-primary)_32%,transparent),transparent_70%),radial-gradient(60%_50%_at_90%_100%,color-mix(in_oklab,var(--color-primary)_16%,transparent),transparent_70%)]"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 400 400"
          className="absolute -bottom-24 -right-24 size-[28rem] text-primary opacity-20"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="200" cy="200" r="80" />
          <circle cx="200" cy="200" r="130" />
          <circle cx="200" cy="200" r="180" />
        </svg>
        <Logo size={36} className="relative" />
        <div className="relative flex flex-col gap-8">
          <p className="font-display text-4xl font-semibold leading-tight text-text">
            Settle in.
            <br />
            The movie starts when you all do.
          </p>
          <ul className="flex flex-col gap-4">
            {highlights.map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-text-muted">
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full border border-border bg-surface text-primary"
                >
                  {item.icon}
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-text-muted">Cozy nights, shared screens.</p>
      </aside>
      <main
        className={cx(
          "flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12",
          backdrop,
          "lg:bg-none",
        )}
      >
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Logo size={24} className="lg:hidden" />
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-3xl font-semibold text-text">{title}</h1>
            <p className="text-sm text-text-muted sm:text-base">{subtitle}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/** A boxed status message for page-level states, such as an expired link or a completed step. */
export function AuthNotice({
  tone,
  children,
}: {
  readonly tone: "error" | "success";
  readonly children: ReactNode;
}) {
  const error = tone === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={cx(
        "flex items-start gap-2.5 rounded-md border p-4 text-sm leading-relaxed text-text",
        error ? "border-danger/50 bg-danger/10" : "border-success/50 bg-success/10",
      )}
    >
      <span className={error ? "text-danger" : "text-success"}>
        <StatusIcon kind={tone} />
      </span>
      <p>
        <span className="sr-only">{error ? "Error: " : "Success: "}</span>
        {children}
      </p>
    </div>
  );
}

/** Separates the email/password form from another sign-in method. */
export function AuthDivider({ label = "OR" }: { readonly label?: string }) {
  return (
    <div role="separator" className="flex items-center gap-3 text-sm text-text-muted">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      {label}
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
