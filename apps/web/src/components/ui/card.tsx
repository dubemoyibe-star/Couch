import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type CardProps = HTMLAttributes<HTMLElement> & {
  readonly as?: "div" | "article" | "section" | "li";
};

/**
 * A grouped, non-interactive surface for content that calls for one (catalog
 * items, couch summaries). Not for wrapping every element. Depth is tonal
 * (surface fill plus a subtle border); no shadow. The border is decorative, so
 * it stays --color-border. If a card becomes clickable, the interactive
 * element inside it owns the boundary and focus treatment.
 */
export function Card({ as: Tag = "div", className, ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={cx("rounded-md border border-border bg-surface p-5", className)}
    />
  );
}
