import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { calmTransition, cx, focusRing } from "./cx";
import { StatusIcon } from "./status-icon";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  readonly label: string;
  readonly id?: string;
  /** Field-level error text. Setting it marks the field invalid. */
  readonly error?: string | null;
  readonly hint?: string;
  /** Decorative icon shown inside the field, before the text. */
  readonly icon?: ReactNode;
  /** For password fields: adds a show/hide toggle. */
  readonly revealable?: boolean;
  /** Small control shown at the right end of the label row, such as a help link. */
  readonly labelAction?: ReactNode;
  /** "brand" swaps the high-contrast white focus ring for a softer terracotta one. */
  readonly focusTone?: "default" | "brand";
};

// Boundary cues (never the decorative --color-border alone):
//   1. border-border-strong, >= 3:1 on background, surface and surface-muted
//   2. a surface fill that differs from the page background
// Focus adds a thick high-contrast outline; error adds a second stroke (inset
// ring) plus an icon and text, so it is not color alone.
export function Input({
  label,
  id,
  error,
  hint,
  icon,
  revealable,
  labelAction,
  focusTone = "default",
  className,
  type,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const [revealed, setRevealed] = useState(false);
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [rest["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="group relative">
        {icon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-text-muted transition-colors duration-150 group-focus-within:text-primary motion-reduce:transition-none [&>svg]:size-[1.125rem]"
          >
            {icon}
          </span>
        ) : null}
        <input
          {...rest}
          type={revealable && revealed ? "text" : type}
          id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "min-h-11 w-full rounded-md border bg-surface px-3.5 py-2.5 text-base text-text placeholder:text-text-muted",
          calmTransition,
          focusTone === "brand"
            ? "focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-transparent focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_25%,transparent)]"
            : "focus-visible:border-focus focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
          error
            ? "border-danger ring-1 ring-inset ring-danger"
            : "border-border-strong hover:border-text-muted",
          "disabled:cursor-not-allowed disabled:opacity-60",
          icon ? "pl-10" : false,
          revealable && "pr-11",
          className,
        )}
      />
        {revealable ? (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            className={cx(
              "absolute inset-y-0 right-1 my-auto flex size-9 cursor-pointer items-center justify-center rounded-md text-text-muted hover:text-text",
              calmTransition,
              focusTone === "brand"
                ? "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary"
                : focusRing,
            )}
          >
            {revealed ? (
              <EyeOff aria-hidden="true" className="size-[1.125rem]" />
            ) : (
              <Eye aria-hidden="true" className="size-[1.125rem]" />
            )}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="flex gap-1.5 text-sm text-danger">
          <StatusIcon kind="error" />
          <span>
            <span className="sr-only">Error: </span>
            {error}
          </span>
        </p>
      ) : null}
    </div>
  );
}
