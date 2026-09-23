# Design system

Source of truth for the design tokens defined in `apps/web/src/app/globals.css`.
Later issues apply these tokens to specific screens and build component
primitives on top of them; this issue only establishes the token layer, so
applying it doesn't change any existing page's visual output.

## Direction

Couch's visual identity is a warm, cinematic, cozy movie-night feel: deep
warm neutrals, earthy terracotta accents, soft cream text on dark, comfortable
rounded shapes. It should read as inviting and human, not corporate, not a
generic dark-mode SaaS dashboard, and not luxury-hotel ornate.

## Tailwind version

`apps/web` is on Tailwind CSS v4 (`"tailwindcss": "^4"`, `@tailwindcss/postcss`),
confirmed from `apps/web/package.json`. There is no `tailwind.config.js`; v4
is CSS-first, so all tokens live in `globals.css`.

## Where tokens are defined

`apps/web/src/app/globals.css`:

- A plain `@theme { ... }` block declares the semantic color roles and the
  radius scale as literal hex values. Plain `@theme` compiles each variable
  to a real CSS custom property on `:root` (Tailwind's own docs: "theme
  variables are turned into regular CSS variables when you compile your
  CSS"), and every generated utility (`bg-background`, `text-text-muted`, ...)
  references that variable rather than a baked-in literal. That's what makes
  the light/dark override below work.
- A `@media (prefers-color-scheme: light) { :root { ... } }` block
  redeclares the same `--color-*` custom properties with the light palette's
  values. No `@custom-variant` is needed for this: Tailwind v4's `dark:`
  variant already defaults to `prefers-color-scheme` with zero config (an
  explicit `@custom-variant dark (...)` is only required to switch to a
  class- or attribute-driven toggle, which this project doesn't use — there
  is no manual theme switch, only OS preference).
- A separate `@theme inline { --font-sans: var(--font-ui); --font-display:
  var(--font-display-face); }` block wires the font tokens. This one
  deliberately uses `inline`, unlike the color block. `--font-ui` and
  `--font-display-face` are CSS variables that next/font attaches to the
  `<html>` element at runtime (`apps/web/src/app/layout.tsx`), so
  `--font-sans` is a reference to a variable declared elsewhere, not a
  literal value. Tailwind's docs describe exactly this case (their example
  is `--font-sans: var(--font-inter)`) and call out that without `inline`,
  the reference is resolved at the point the theme variable is declared and
  can silently fail to pick up the "real" variable. `inline` keeps it live.
  This is unrelated to the dark/light switching reasoning above: the color
  tokens never reference a second, differently-named variable, so they don't
  hit that resolution-order problem and don't need `inline`.

Dark is the palette that applies with no OS preference or an explicit dark
preference, since dark is Couch's primary/default experience. The light
block only fires when the OS explicitly reports `prefers-color-scheme: light`.

## Semantic color roles

| Token | Purpose |
| --- | --- |
| `--color-background` | Page background |
| `--color-surface` | Cards, panels, raised content |
| `--color-surface-muted` | Recessed/secondary surfaces inside a surface |
| `--color-border` | Dividers, outlines, subtle separation |
| `--color-text` | Primary body/heading text |
| `--color-text-muted` | Secondary text, metadata, captions |
| `--color-primary` | Primary actions, links, brand accent |
| `--color-primary-hover` | Hover/active state for primary-colored elements |
| `--color-primary-foreground` | Text/icon color placed on top of `--color-primary` |
| `--color-success` / `--color-warning` / `--color-danger` / `--color-info` | Status colors |

Exposed as Tailwind utilities via the `--color-*` naming convention, e.g.
`bg-background`, `text-text-muted`, `bg-primary`, `text-primary-foreground`,
`border-border`.

## Palettes as shipped

### Dark (default)

| Token | Hex |
| --- | --- |
| `background` | `#171412` |
| `surface` | `#241F1B` |
| `surface-muted` | `#1D1916` |
| `border` | `#3A332C` |
| `text` | `#F4EEE7` |
| `text-muted` | `#B8AA9C` |
| `primary` | `#C47A4A` |
| `primary-hover` | `#D18A57` |
| `primary-foreground` | `#171412` |
| `success` | `#8FBF74` |
| `warning` | `#E0A458` |
| `danger` | `#E0796A` |
| `info` | `#7FB0D6` |

`background`, `surface`, `text`, and `primary` come from the original warm
cinematic reference palette unchanged — they already pass contrast (see
below). `surface-muted`, `border`, `text-muted`, `primary-hover`,
`primary-foreground`, and the four status colors weren't part of that
original six-color reference; they're new, chosen to fit the same warm,
earthy direction and verified for contrast where they carry text.

### Light

| Token | Hex |
| --- | --- |
| `background` | `#FBF6EF` |
| `surface` | `#F3EAD9` |
| `surface-muted` | `#EDE2CF` |
| `border` | `#E3D5C3` |
| `text` | `#2B211A` |
| `text-muted` | `#6B5D4F` |
| `primary` | `#9C5827` |
| `primary-hover` | `#7F4620` |
| `primary-foreground` | `#FBF6EF` |
| `success` | `#4F7A3D` |
| `warning` | `#8A5A18` |
| `danger` | `#B23B2A` |
| `info` | `#2E6B8F` |

There was no existing light-mode reference palette, only a direction: warm
off-white background, cream/tan surfaces, dark warm text, terracotta primary,
kept warm rather than clinical. `background`/`surface`/`text` were derived to
match that direction. **`primary` and `primary-hover` deviate from the dark
palette's reference terracotta (`#C47A4A`) and its lighter variant
(`#D6A77A`):** used as-is against the light background, `#C47A4A` only
reaches 3.13:1 contrast, below the 4.5:1 AA threshold for text-sized use
(links, icon-button labels). It was darkened to `#9C5827` (5.09:1) and the
hover state to `#7F4620` (6.98:1) — the same terracotta hue and saturation,
just enough darker to clear AA on a light background. Dark mode needed no
such adjustment because the reference primary already passes there (5.44:1,
see below).

## Contrast verification

Calculated with the standard WCAG relative-luminance formula (sRGB,
`(L1+0.05)/(L2+0.05)`). Thresholds: 4.5:1 for body text, 3:1 for large
text/UI components.

| Pair | Before | After | Result |
| --- | --- | --- | --- |
| Dark `text` on `background` (`#F4EEE7` / `#171412`) | 15.92:1 | — (unchanged) | Pass |
| Dark `text` on `surface` (`#F4EEE7` / `#241F1B`) | 14.17:1 | — (unchanged) | Pass |
| Dark `text-muted` on `background` (`#B8AA9C` / `#171412`) | 8.09:1 | — (new token, no "before") | Pass |
| Dark `primary` on `background`, used as text (`#C47A4A` / `#171412`) | 5.44:1 | — (unchanged) | Pass |
| Dark `primary-foreground` on `primary` (`#171412` / `#C47A4A`) | 5.44:1 | — | Pass |
| Dark `primary-foreground` on `primary-hover` (`#171412` / `#D18A57`) | 6.54:1 | — (new token) | Pass |
| Dark `success`/`warning`/`danger`/`info` on `background` | 8.62:1 / 8.40:1 / 6.21:1 / 7.93:1 | — (new tokens) | Pass |
| Light `text` on `background` (`#2B211A` / `#FBF6EF`) | 14.63:1 | — | Pass |
| Light `text` on `surface` (`#2B211A` / `#F3EAD9`) | 13.17:1 | — | Pass |
| Light `text-muted` on `background` (`#6B5D4F` / `#FBF6EF`) | 5.91:1 | — | Pass |
| Light `primary` on `background`, used as text | 3.13:1 (`#C47A4A`) | 5.09:1 (`#9C5827`) | **Failed, then fixed** |
| Light `primary-foreground` on `primary` | 4.40:1 (`#FBF6EF` / `#A9612F`, interim) | 5.09:1 (`#FBF6EF` / `#9C5827`) | **Failed AA-body margin, then fixed** |
| Light `primary-foreground` on `primary-hover` | — | 6.98:1 (`#FBF6EF` / `#7F4620`) | Pass |
| Light `success`/`warning`/`danger`/`info` on `background` | — | 4.67:1 / 5.49:1 / 5.50:1 / 5.40:1 | Pass |

**`border` and `surface-muted` were not checked against the 3:1 non-text/UI-component
threshold.** This issue's contrast scope covers `text`-on-`background` and
`text-muted`-on-`background` (plus `primary`/`primary-foreground`, since those
carry button-label text); `border` and `surface-muted` are outside that
scope because this issue doesn't decide where they get used. The actual
ratios, computed the same way as the pairs above:

| Pair | Dark | Light |
| --- | --- | --- |
| `border` on `background` | 1.48:1 | 1.34:1 |
| `surface-muted` on `surface` | 1.07:1 | 1.07:1 |

Both are well under 3:1 in both palettes. That's fine for a purely decorative
divider or background fill, which WCAG 1.4.11 (Non-text Contrast) doesn't
require 3:1 for. It is **not** fine if a later issue uses `border` as the
*sole* visual indicator of an interactive component's boundary (e.g. an
unstyled input or button outline with no other affordance) — that case does
require 3:1, and `border` as shipped here doesn't clear it. Whoever builds
those primitives needs to either lighten `border` for that specific use or
pair it with a non-color affordance (fill, shadow, focus ring) instead of
relying on the border alone.

### Resolution: interactive controls (UI primitives)

The gap above is resolved for every interactive primitive in
`apps/web/src/components/ui/`. Two tokens were added (both palettes):

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--color-border-strong` | `#7A6D5F` | `#8A7A6A` | Boundary of interactive controls |
| `--color-focus` | `#F4EEE7` | `#2B211A` | Keyboard focus ring (same value as `text`) |

`border-strong` measured against every surface a control can sit on:

| Pair | Dark | Light |
| --- | --- | --- |
| on `background` | 3.65:1 | 3.85:1 |
| on `surface` | 3.25:1 | 3.47:1 |
| on `surface-muted` | 3.48:1 | 3.23:1 |

All are at or above 3:1. Focus ring on `background`: 15.92:1 dark, 14.63:1
light. The decorative `--color-border` is unchanged and remains for dividers
and non-interactive edges.

Per component:

- **Input**: color adjustment. Uses `border-strong` (table above) and also a
  `surface` fill against the page background, so the boundary has two cues.
  Error adds a second stroke (inset ring), an icon and text, in `danger`
  (6.21:1 dark, 5.50:1 light on `background`).
- **Button, secondary**: color adjustment plus fill. `border-strong` and a
  `surface` fill.
- **Button, primary**: no border needed. The boundary is the solid `primary`
  fill against the page, a background shift (`primary` on `background` is
  5.44:1 dark; light `primary` on `background` is 5.09:1).
- **Card**: not interactive. Keeps the decorative `border` plus a `surface`
  fill (tonal depth). If a card becomes clickable, the control inside it must
  use the treatments above.
- **Badge**: not interactive. Decorative `border` plus `surface-muted` fill.
  The label text uses `text` (not the status color) so it stays above 4.5:1
  in both palettes; the status color is only a leading dot next to a label
  that names the status.
- **FormError / FormSuccess**: not interactive. Use `danger` and `success`
  text (all above 4.5:1 on `background`) with an icon and a screen-reader
  prefix.

## Typography

### Options considered

1. **Inter (UI sans) + Fraunces (display)** — chosen. Inter is a mature,
   extremely legible grotesque with full weight/language coverage, the kind
   of default that disappears into functional UI (nav, forms, buttons,
   metadata) rather than fighting for attention. Fraunces is a variable
   serif built specifically for a warm, slightly soft, non-luxury editorial
   feel — its "soft" character reads cozy/human rather than haute-editorial,
   giving headings personality without tipping into an overly luxurious or
   fashion-editorial look.
2. **Manrope (UI sans) + Newsreader (display)** — a quieter, more literary
   pairing. Newsreader is a calmer text-serif than Fraunces; it would read
   as more restrained/editorial and less cinematic/personality-forward.
   Good fallback if Fraunces reads too characterful once applied to real
   headings in a later issue.
3. **Public Sans (UI sans) + Playfair Display (display)** — rejected.
   Playfair Display is a high-contrast didone that reads as classic
   luxury/fashion-editorial, which is the opposite of the warm, unpretentious
   feel Couch is going for.

All three are available with zero external stylesheet requests via
`next/font/google`, which self-hosts the font files at build time and
inlines `@font-face` with `size-adjust` metrics, so there's no
render-blocking Google Fonts request and no font-driven layout shift beyond
what `next/font`'s built-in metric matching already handles.

### Implementation

`apps/web/src/app/layout.tsx` loads both via `next/font/google`:

```ts
const fontUi = Inter({ variable: "--font-ui", subsets: ["latin"], display: "swap" });
const fontDisplay = Fraunces({ variable: "--font-display-face", subsets: ["latin"], display: "swap" });
```

Both variables are attached to `<html>`'s `className`. `globals.css` maps
them to the `--font-sans` / `--font-display` theme tokens (see "Where tokens
are defined" above), so `font-sans` / `font-display` are the only class
names components should use — swapping the actual typeface later is a
one-line change in `layout.tsx` plus the two `@theme inline` lines, not a
find-and-replace across components. Per this issue's scope, `font-display` is
not yet applied to any component; that's for the issues that restyle
specific pages.

## Shape

UI elements stay in a modest, comfortably-rounded radius range; media
artwork gets a visibly larger radius than UI, reinforcing the softer,
cinematic feel of posters and thumbnails specifically.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` | `0.375rem` (6px) | Small UI: badges, chips, inputs |
| `--radius-md` | `0.625rem` (10px) | Default UI: buttons, cards, panels |
| `--radius-lg` | `0.875rem` (14px) | Larger structured surfaces, modals |
| `--radius-media` | `1.25rem` (20px) | Posters, thumbnails, provider artwork |

`--radius-sm/md/lg` override Tailwind's built-in radius theme keys, so
existing `rounded-sm`/`rounded-md`/`rounded-lg` utilities pick up the new
scale automatically. `--radius-media` is a new key, used via `rounded-media`.

## Spacing

Tailwind's default spacing scale (`--spacing: 0.25rem` base, so `p-4` =
1rem, `gap-2` = 0.5rem, etc.) was not overridden. It already has enough
resolution at both ends for the guiding spacing principle — more space
between sections, less space between related elements — so small steps
(`gap-1`/`gap-2`) work for tightly related items and large steps
(`gap-12`/`gap-16`/`py-20`+) work for section breaks. No new spacing tokens
were added. This is a convention for later issues to follow, not a new
token.
