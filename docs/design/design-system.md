# IsItPolite design system: "Travel journal"

Warm paper, ink text, a teal for links and focus, and one terracotta primary action per screen.

## Where it lives

- Tokens: `:root` in `src/css/base.css`. Old token names (`--primary`, `--accent`, `--bg`, `--text`) are aliases of the new ones, so older components follow the palette automatically.
- Layout, nav, stamp and component overrides: `src/css/journal.css`, loaded last (see `CSS_PARTS` in `build-seo.mjs`).
- Static pages (pair, hub, index, privacy, 404) share `style.css`, so they get the same header, logo badge and tokens.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--paper` | `#FAF7F2` | page background |
| `--surface` / `--surface-alt` | `#FFFFFF` / `#F3EEE6` | cards / insets |
| `--line` | `#E7E1D7` | hairline borders and dividers |
| `--field-border` | `#8C847A` | input borders (3.7:1 on white) |
| `--ink` / `--ink-muted` / `--ink-faint` | `#1C1917` / `#57534E` / `#6B635C` | text (16.4 / 7.1 / 5.5 : 1 on paper) |
| `--teal` / `--teal-dark` / `--teal-tint` | `#0F766E` / `#115E59` / `#E6F2F0` | links, focus ring, active nav |
| `--terracotta` / `--terracotta-dark` | `#B4532A` / `#9A4522` | the primary CTA (white text 5.0 : 1) |
| polite | `#166534` on `#ECF5EE` | 6.4 : 1 |
| caution | `#92400E` on `#FBF3E4` | 6.4 : 1 |
| rude | `#9F1239` on `#FBECEF` | 7.0 : 1 |

Ratios were computed, not estimated. Keep new colour pairs at 4.5:1 for text and 3:1 for UI boundaries.

## Type, shape, motion

- Headings and verdict labels: **Fraunces** (500-700). UI and body: **Inter** (400-600). 16px body, 16px inputs (no iOS zoom).
- Cards 12px radius, inputs and buttons 8px, chips pill. 1px `--line` border, one soft shadow. No inset or clay shadows.
- Motion is 150-220ms standard easing. The only flourish is the verdict stamp (180ms). `prefers-reduced-motion` disables it.

## Signature elements

- **Verdict stamp:** uppercase Fraunces label with a double border (border plus offset outline) in the verdict colour, rotated -2 degrees.
- **Route line:** a 2px dotted divider between card sections and page sections.

## Navigation

Five views: Check, Compare, Guide, Quiz, History. Desktop shows them inline in a 64px header. Below 768px they become a fixed bottom tab bar (56px targets) and the header is just the wordmark.

Hash routes: `#/check`, `#/compare`, `#/compare/trip`, `#/guide`, `#/quiz`, `#/history`. `#/trip` and `#/community` redirect to their new homes. `?g=&c=&ctx=`, `?feedback=1` and `?support=1` still work.

## Rules for new UI

1. One terracotta button per screen. Secondary actions are teal outline, tertiary are text links.
2. Use tokens, never raw hex, in components.
3. Modals need nothing extra: `initModalA11y()` in `src/js/init.js` handles scroll lock, focus in and out, Escape, backdrop click and the Tab trap for any `.modal-overlay`.
4. No emoji in UI. Use the inline SVG icons.

## Dark mode

Automatic from the system setting (`prefers-color-scheme: dark`); there is no manual toggle. The dark palette is a second token block in `src/css/base.css`, and the page also sets `color-scheme: light dark` and a dark `theme-color`. Components only reference tokens, so the few exceptions live at the end of `journal.css`.

Rules that keep it working: use `--teal-solid` (not `--teal`) for fills that carry white text, `--inverse-bg` / `--inverse-fg` for the dark-on-light pill, and `--terracotta-text` for terracotta used as text. All dark pairs were computed to pass AA (text 4.5:1, UI 3:1).

## Premium artifacts

The PNG/PDF templates in `src/_templates.js` use the same palette, Fraunces and Inter (Noto Sans JP/Arabic/SC remain as fallbacks for non-Latin phrases), solid teal headers, dotted dividers and a stamp-style certificate grade. They are always light, since they are meant to be printed or shared.

## Not done yet

- A manual light/dark toggle.