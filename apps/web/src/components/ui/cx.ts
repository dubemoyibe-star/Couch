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

/**
 * Focus and hover treatment for text fields: a terracotta border with a soft
 * halo instead of the high-contrast outline. Shared by every text input so
 * they all match the sign-in and sign-up fields.
 */
export const inputFocus =
  "transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none not-focus:hover:border-text-muted focus-visible:border-primary/70 focus-visible:outline-2 focus-visible:outline-transparent focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_14%,transparent)]";
