import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import { calmTransition, cx } from "./cx";
import { StatusIcon } from "./status-icon";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  readonly label: string;
  readonly id?: string;
  /** Field-level error text. Setting it marks the field invalid. */
  readonly error?: string | null;
  readonly hint?: string;
};

// Boundary cues (never the decorative --color-border alone):
//   1. border-border-strong, >= 3:1 on background, surface and surface-muted
//   2. a surface fill that differs from the page background
// Focus adds a thick high-contrast outline; error adds a second stroke (inset
// ring) plus an icon and text, so it is not color alone.
export function Input({ label, id, error, hint, className, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [rest["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "min-h-11 w-full rounded-md border bg-surface px-3.5 py-2.5 text-base text-text placeholder:text-text-muted",
          calmTransition,
          "focus-visible:border-focus focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
          error
            ? "border-danger ring-1 ring-inset ring-danger"
            : "border-border-strong hover:border-text-muted",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      />
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
