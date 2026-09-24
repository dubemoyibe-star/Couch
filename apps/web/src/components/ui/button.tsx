import type { ButtonHTMLAttributes } from "react";
import { calmTransition, cx, focusRing } from "./cx";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary: softer radius, filled. secondary: more structured, outlined on a surface. */
  readonly variant?: "primary" | "secondary";
  /** Pending state, for example a submitting form. Keeps focus, blocks clicks, announces busy. */
  readonly loading?: boolean;
  /** Visible text while loading, so the state is not conveyed by the spinner alone. */
  readonly loadingLabel?: string;
};

// Secondary's boundary is --color-border-strong (>= 3:1) AND a surface fill.
// Primary is a solid fill against the page, so it has no border to rely on.
const variants = {
  primary:
    "rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover active:bg-[color-mix(in_oklab,var(--color-primary-hover)_90%,black)] active:translate-y-px",
  secondary:
    "rounded-md border border-border-strong bg-surface text-text hover:border-text-muted hover:bg-surface-muted active:bg-background",
} as const;

/** Button styling for an element that is not a <button>, such as a link that should look like one. */
export function buttonClassName(variant: "primary" | "secondary" = "primary", className?: string) {
  return cx(
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium",
    calmTransition,
    focusRing,
    variants[variant],
    className,
  );
}

export function Button({
  variant = "primary",
  loading = false,
  loadingLabel = "Please wait…",
  type = "button",
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      // aria-disabled (not disabled) while loading keeps keyboard focus on the button.
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (loading) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={cx(
        buttonClassName(variant),
        "disabled:cursor-not-allowed disabled:opacity-50",
        loading && "opacity-80 aria-busy:cursor-progress",
        className,
      )}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
          />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
