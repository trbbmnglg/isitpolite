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

Four tabs: Check, Trip, Guide, Saved (Material recommends 3-5; labels always visible, the selected label is not bolded on mobile). Compare opens from a link on Check and Quiz from Guide; each highlights its parent tab. Saved collects trip briefings, offline country guides and recent checks. Desktop shows them inline in a 64px header. Below 768px they become a fixed bottom tab bar (56px targets) and the header is just the wordmark.

Hash routes: `#/check`, `#/trip`, `#/guide`, `#/saved`, `#/compare`, `#/quiz`. `#/compare/trip`, `#/community` and `#/history` redirect to their new homes. `?g=&c=&ctx=`, `?feedback=1` and `?support=1` still work.

## Patterns (refined 2026-10-18 after design research)

- **Stamp only on the hero verdict.** Everywhere else (also-check cards, history, lists) use the flat `.v-tag`: colour plus the word Polite / Caution / Rude, never colour alone.
- **Legend.** Every result and guide page ends with "What do these labels mean?". The text lives in `src/_labels.js`, which also feeds the Check prompt's confidence rules, so the UI and the model use the same definitions.
- **Numbered citations.** Check answers carry `[n]` markers after the sentences a source supports; they link to a numbered source list. Forum sources are labelled "traveler discussion".
- **Briefing do / don't.** NHS-style stacked lists headed "Do" and "Don't" (icons decorative); every Don't starts with "Do not". Each point has "Mark as read", with a progress bar saved alongside the briefing, and the header confirms "Saved for offline use".

- **Sharing.** Results, briefings and quiz scores use the phone's share sheet (`shareOrCopy` in `src/js/ui.js`) with a copy-link fallback; secondary (teal outline) style, never terracotta.
- **Briefing extras.** "Three phrases to know" card, "Remind me before I fly" (calendar file built on the device) and an install card offered only after a briefing is saved. All secondary style.
- **Instant answers.** Fact-checked answers show "Fact-checked guide · reviewed <date> · Full guide →" under the stamp.
- **Preview cards.** `seo/og.mjs`: paper background, Fraunces question, verdict stamp, teal wordmark; always light.

## Token tiers

1. **Option tokens**: the raw palette (`--paper`, `--teal`, `--terracotta`, verdict colours) in `base.css`, swapped for dark mode.
2. **Decision tokens**: semantic aliases (`--text`, `--bg`, `--primary`, `--teal-solid`, `--inverse-bg`, `--field-border`).
3. **Component styles**: `journal.css` and the partials, which must only reference tier 1 or 2 tokens.

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