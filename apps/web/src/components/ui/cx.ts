/** Joins class names, skipping falsy values. Avoids a dependency for a one-liner. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Shared keyboard focus ring: 3px, offset from the control, high contrast in both palettes. */
export const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Calm state transitions. Removed entirely under prefers-reduced-motion. */
export const calmTransition =
  "transition-colors duration-150 ease-out motion-reduce:transition-none";
