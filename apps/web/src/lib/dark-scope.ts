import type { CSSProperties } from "react";

/**
 * The dark palette from globals.css as inline custom properties. Put it on an
 * element to keep that subtree dark under a light OS preference, for panels
 * that show a night scene or artwork. Token classes inside follow it.
 */
export const darkScope = {
  "--color-background": "#171412",
  "--color-surface": "#241F1B",
  "--color-surface-muted": "#1D1916",
  "--color-border": "#3A332C",
  "--color-border-strong": "#7A6D5F",
  "--color-text": "#F4EEE7",
  "--color-text-muted": "#B8AA9C",
  "--color-primary": "#C47A4A",
  "--color-primary-hover": "#D18A57",
  "--color-primary-foreground": "#171412",
  "--color-focus": "#F4EEE7",
} as CSSProperties;
