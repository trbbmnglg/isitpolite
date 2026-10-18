// Link-preview cards (1200×630 PNG) for the static pages, in the Travel
// journal style. Build-time only: satori lays out, resvg rasterises.
// Cards are cached by content hash in ./.og-cache so rebuilds are fast.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.og-cache');
const font = (pkg, file) => readFileSync(join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file));
const FONTS = [
  { name: 'Fraunces', data: font('fraunces', 'fraunces-latin-600-normal.woff'), weight: 600, style: 'normal' },
  { name: 'Fraunces', data: font('fraunces', 'fraunces-latin-700-normal.woff'), weight: 700, style: 'normal' },
  { name: 'Inter', data: font('inter', 'inter-latin-500-normal.woff'), weight: 500, style: 'normal' },
  { name: 'Inter', data: font('inter', 'inter-latin-600-normal.woff'), weight: 600, style: 'normal' },
];

const C = { paper: '#FAF7F2', ink: '#1C1917', muted: '#57534E', faint: '#6B635C', line: '#E7E1D7', teal: '#0F766E', tealDark: '#115E59', tint: '#E6F2F0', terra: '#B4532A' };
const VERDICT = {
  polite: { fg: '#166534', bg: '#ECF5EE' },
  caution: { fg: '#92400E', bg: '#FBF3E4' },
  rude: { fg: '#9F1239', bg: '#FBECEF' },
};

const GLOBE = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
).toString('base64');

// Tiny hyperscript helper: h('div', style, ...children)
function h(type, style, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}

function brandRow(note) {
  return h('div', { alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    h('div', { alignItems: 'center', gap: 16 },
      h('div', { width: 56, height: 56, borderRadius: 14, background: C.teal, alignItems: 'center', justifyContent: 'center' },
        { type: 'img', props: { src: GLOBE, width: 32, height: 32 } }),
      h('div', { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 34, color: C.ink }, 'IsItPolite',
        h('span', { color: C.faint }, '.com'))),
    note ? h('div', { fontFamily: 'Inter', fontWeight: 600, fontSize: 24, color: C.tealDark, background: C.tint, padding: '10px 20px', borderRadius: 999 }, note) : null);
}

function stamp(verdictKey, label) {
  const v = VERDICT[verdictKey] || VERDICT.caution;
  return h('div', { transform: 'rotate(-2deg)', border: `4px solid ${v.fg}`, borderRadius: 10, padding: 6, background: v.bg },
    h('div', { border: `3px solid ${v.fg}`, borderRadius: 6, padding: '12px 26px', fontFamily: 'Fraunces', fontWeight: 700, fontSize: 40, color: v.fg, letterSpacing: 2, textTransform: 'uppercase', maxWidth: 980 }, label));
}

function frame(...children) {
  return h('div', { width: 1200, height: 630, boxSizing: 'border-box', background: C.paper, flexDirection: 'column', justifyContent: 'space-between', padding: '52px 72px 48px', borderTop: `12px solid ${C.teal}` }, ...children);
}

function kicker(text) {
  return h('div', { fontFamily: 'Inter', fontWeight: 600, fontSize: 26, color: C.tealDark, letterSpacing: 3, textTransform: 'uppercase' }, text);
}

function title(text, size) {
  return h('div', { fontFamily: 'Fraunces', fontWeight: 600, fontSize: size || 66, color: C.ink, lineHeight: 1.12, maxWidth: 1050 }, text);
}

// kind: 'pair' | 'hub' | 'origin'
export function cardTree(card) {
  if (card.kind === 'pair') {
    return frame(
      h('div', { flexDirection: 'column', gap: 18 }, kicker(card.kicker), title(card.question, card.question.length > 60 ? 56 : 66)),
      h('div', { alignItems: 'center', gap: 28 }, stamp(card.verdict, card.label),
        card.confidence ? h('div', { fontFamily: 'Inter', fontWeight: 600, fontSize: 24, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }, card.confidence + ' confidence') : null),
      brandRow(card.note));
  }
  return frame(
    h('div', { flexDirection: 'column', gap: 18 }, kicker(card.kicker), title(card.title, 72),
      h('div', { fontFamily: 'Inter', fontWeight: 500, fontSize: 32, color: C.muted, lineHeight: 1.35, maxWidth: 1000 }, card.subtitle)),
    brandRow(card.note));
}

export async function renderOgCard(card) {
  const svg = await satori(cardTree(card), { width: 1200, height: 630, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

// Writes the card to `outPath`, reusing the cached PNG when the card is unchanged.
export async function writeOgCard(card, outPath) {
  const key = createHash('sha256').update(JSON.stringify(card) + '|v1').digest('hex').slice(0, 20);
  const cached = join(CACHE, key + '.png');
  mkdirSync(dirname(outPath), { recursive: true });
  if (existsSync(cached)) { copyFileSync(cached, outPath); return false; }
  const png = await renderOgCard(card);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, png);
  writeFileSync(outPath, png);
  return true;
}
