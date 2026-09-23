import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  readonly tone?: BadgeTone;
};

// The label text always uses --color-text (13:1+ on surface-muted in both
// palettes). The tone is a leading dot in the semantic color, and the label
// itself says what the status is, so meaning is never color alone.
const dot: Record<BadgeTone, string> = {
  neutral: "bg-text-muted",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-text",
        className,
      )}
    >
      <span aria-hidden="true" className={cx("size-1.5 rounded-full", dot[tone])} />
      {children}
    </span>
  );
}
