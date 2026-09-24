// Full class strings (not built dynamically) so Tailwind can see them at build time.
const posters = [
  "bg-linear-to-br from-primary/70 via-primary/25 to-surface-muted",
  "bg-linear-to-br from-danger/60 via-primary/25 to-surface-muted",
  "bg-linear-to-br from-warning/60 via-primary/20 to-surface-muted",
  "bg-linear-to-br from-info/55 via-primary/20 to-surface-muted",
  "bg-linear-to-br from-success/50 via-primary/20 to-surface-muted",
  "bg-linear-to-tr from-primary/60 via-info/25 to-surface-muted",
] as const;

/** Stable poster gradient for a couch, so the same couch always looks the same. */
export function couchPosterClass(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return posters[hash % posters.length] ?? posters[0];
}

/** First letter of the name, uppercased, used as the poster monogram. */
export function couchMonogram(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "C";
}
