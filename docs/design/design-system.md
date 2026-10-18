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

## Not done yet

- Dark mode (the tokens make it a swap, but it needs a visual pass and the app has some hardcoded light values).
- Restyling the server-rendered premium PNG/PDF artifacts in `src/_templates.js`, and regenerating `og-image.png` and the app icons.
