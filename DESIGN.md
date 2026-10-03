---
name: Sprigo
description: "Warm, playful, chunky UI for a local-first language learning app. A garden theme: things grow as you learn."
colors:
  light:
    bg: "#fbf8f1"
    surface: "#f3eee2"
    card: "#fffdf8"
    border: "#e5ddcc"
    text: "#2e2a24"
    text-muted: "#6b6357"
    text-faint: "#a59d8f"
    green: "#4f8a3c"        # primary: progress, correct, main CTA
    green-dark: "#3a6a2b"
    green-bright: "#b5dc8a"
    blue: "#3d7a99"         # navigation, focus, secondary CTA
    blue-dark: "#2d627d"
    sky: "#e3eef0"
    gold: "#e0a526"         # rewards: coins, chests, legendary
    gold-dark: "#b98318"
    red: "#c4553f"          # wrong answer, destructive
    red-dark: "#9f402d"
    purple: "#8a5a8c"       # live / AI tutor
    purple-dark: "#6c4270"
    bark: "#8a6242"         # checkpoints
    bark-dark: "#6b4a30"
  dark:
    bg: "#161a13"
    surface: "#21271d"
    card: "#1b2018"
    border: "#2f3629"
    text: "#ece7da"
    text-muted: "#a7a18f"
    text-faint: "#6c6858"
    green: "#5e9a48"
    green-dark: "#406f31"
    green-bright: "#a9d27c"
typography:
  family: "Nunito (bundled, offline), Segoe UI, system-ui, sans-serif"
  base: 16px / 1.5
  weights: [800, 900]       # labels and headings are heavy; body stays regular
  scale: [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26]
  caps: "Buttons, nav and kickers: UPPERCASE, letter-spacing .8–1px"
radius:
  sm: 8px
  base: 12px                # --r
  card: 16px
  sheet: 20px
  pill: 99px
elevation: "Solid offset shadows, no blur: 0 2px 0 (chips, ghost), 0 4px 0 (buttons, unit heads), 0 5–6px 0 (path nodes). Shadow colour = the -dark shade of the fill."
layout:
  sidebar: 240px
  center: 640px
  rail: 340px
  breakpoints: { mobile: "<768px", tablet: "768–1099px", desktop: ">=1100px" }
  touch-target: 44px
---

# Sprigo design system

The source of truth is code: tokens live in [`src/styles.css`](src/styles.css) (`:root` and `html[data-theme="dark"]`), the theme switch in [`src/theme.ts`](src/theme.ts), icons in [`src/icons.tsx`](src/icons.tsx). This file says how to use them. Design decisions and their reasons: [docs/DECISIONS.md](docs/DECISIONS.md#f-design).

## Feel

Friendly, tactile, a little toy-like. Earthy cream backgrounds instead of white, leafy greens instead of neon. Everything you can press looks pressable: a solid colour block sitting on a darker "edge" that collapses when clicked.

## Colour

- Use the CSS variables, never raw hex in components. New colours go into both `:root` and the dark block.
- One meaning per hue: **green** = progress, correct, primary action; **blue** = navigation, focus, secondary action; **gold** = rewards; **red** = wrong, destructive; **purple** = live/AI tutor; **bark** = checkpoints.
- Every accent has a `-dark` partner used only for its 3D edge, and some have a `-tint` / `-tint-border` pair for feedback panels.
- Text on accents uses `--on-accent` (white). Gold surfaces with dark content use `--text`.
- Biomes ([`src/biomes.ts`](src/biomes.ts)) recolour the Learn path per unit via `--bt`, `--btd`, `--bh`, `--bhd`; components fall back to green.

## Dark mode

System, light or dark ([DECISIONS F1](docs/DECISIONS.md#f-design)), applied as `html[data-theme]` before first render. Dark mode redefines the neutrals, the greens and the tints; scenes get `filter: brightness(.62) saturate(.85)`. Check every new screen in both themes.

## Type

Nunito, bundled with the app (no network). Headings 900, labels and buttons 800, body 400 at 16px. Buttons, nav items and kickers are UPPERCASE with wide tracking; body copy and inputs never are.

## Components

- **Buttons** (`.btn` + `.btn-primary | -blue | -gold | -ghost | -danger`): 44px min height, 12px radius, `0 4px 0` edge, `translateY(2px)` on press. Disabled = `--border` fill, no edge.
- **Cards** (`.card`, `.rail-card`): `--card` fill, 2px `--border`, 16px radius, 16px padding. Borders over shadows.
- **Sheets** (`.sheet`): centred, max 420px, 20px radius, over `--scrim`.
- **Path nodes**: 64px pebble SVGs with a darker shadow copy offset 5px; states `done`, `current` (pulsing ring), `locked` (border colour, faint icon), `chest` / `legendary` (gold), `checkpoint` (bark).
- **Unit heads**: sticky, biome-coloured, with a soft white hill silhouette in the corner.
- **Faces** ([`src/face/`](src/face/)): character busts that blink, think and lip-sync; state is written to CSS variables, not React state.
- **Icons**: 24×24 stroke icons, `stroke-width` 2.2–2.4, round caps, `currentColor`. Size via `--ic` on the `.ic` wrapper.

## Layout

Three columns on desktop: sidebar 240px, centre up to 640px, right rail 340px (rail only at ≥1100px). Below 768px the sidebar becomes a bottom nav and safe-area insets apply. The `od-*` layout primitives at the top of `styles.css` handle stacks, rows and grids; prefer them over one-off flex rules.

## Motion

Short and springy: 100–200ms transforms, gentle loops (`bob`, `ring`, `sway`, the live dot pulse). Both the OS `prefers-reduced-motion` and the per-profile Settings → Reduce motion (`:root[data-motion="reduce"]`) shut animations off; any new animation must respect both.

## Accessibility

- 44px minimum touch targets.
- Focus: `3px solid var(--blue)` outline, 2px offset, on `:focus-visible`.
- Never rely on colour alone: wrong/correct states also change icon and copy.
- All UI text goes through i18n ([`src/locales/`](src/locales/)); leave room for longer translations (truncate with ellipsis, don't fix widths on text).
