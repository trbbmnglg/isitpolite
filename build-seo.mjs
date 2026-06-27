// ─────────────────────────────────────────────────────────────────────────
// build-seo.mjs — assemble the deployable ./dist and generate static,
// crawlable etiquette pages for SEO.
//
//   node build-seo.mjs              generate every (gesture × country) pair
//   node build-seo.mjs --limit 20   only make up to 20 new API calls this run
//   node build-seo.mjs --sample     no API — use built-in sample records
//
// DeepSeek key (only needed to generate NEW pages):
//   PowerShell:  $env:DEEPSEEK_API_KEY="sk-..."; node build-seo.mjs
//   bash:        DEEPSEEK_API_KEY=sk-... node build-seo.mjs
//
// Then deploy the assembled folder:
//   npx wrangler pages deploy dist --project-name isitpolite --branch main
//
// ./dist contains ONLY public assets (app shell + functions + etiquette pages
// + sitemap). Build tooling and the AI cache (./seo-cache) never ship.
// Generated content is cached in ./seo-cache so re-runs are incremental.
// ─────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, copyFileSync, cpSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  BASE_URL, GESTURES, COUNTRIES, CONTEXT_LABELS,
  countrySlug, gestureSlug, allPairs,
} from './seo/seo-data.mjs';
import { renderPairPage, renderCountryHub, renderSeoIndex } from './seo/template.mjs';

const ROOT      = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(ROOT, 'seo-cache');
const DIST      = join(ROOT, 'dist');
const OUT_DIR   = join(DIST, 'etiquette');

// Public files copied verbatim into ./dist (the app shell).
const STATIC_FILES = ['index.html', '404.html', 'privacy.html', 'app.js', 'style.css', 'sw.js', 'manifest.json', 'robots.txt', 'favicon.ico', 'favicon.png', 'icon-192.png', 'icon-512.png', 'og-image.png', 'gcash-qr.png', 'logo.svg'];

const args   = process.argv.slice(2);
const SAMPLE = args.includes('--sample');
const LIMIT  = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i + 1], 10) : Infinity; })();
const CONCURRENCY = 6;

const API_KEY    = process.env.DEEPSEEK_API_KEY;
const DIRECT_URL = 'https://api.deepseek.com/v1/chat/completions';
const PROXY_URL  = `${BASE_URL}/api/ask`;     // deployed Pages Function (holds the key)
// With a local key → call DeepSeek directly. Without one → route through the
// deployed proxy (it has the key; server-side calls send no Origin, which it allows).
const VIA_PROXY  = !API_KEY;

// ── Built-in sample records (used by --sample, no API needed) ────────────
const SAMPLE_RECORDS = {
  'japan|tipping-at-a-restaurant': {
    verdict: 'rude', verdict_label: 'Considered insulting', confidence: 'high',
    explanation: 'Tipping is not part of Japanese service culture and can come across as insulting, implying staff are not already paid fairly or take pride in their work. Excellent service is the standard, not something that needs a bonus.',
    local_tip: 'Skip the tip entirely — a sincere "gochisousama deshita" after a meal is the polite way to show appreciation.',
    regional_note: 'Some high-end international hotels and tour guides catering to foreigners now quietly accept tips, but it remains unusual.',
    also_check: [
      { country: 'United States', verdict: 'polite', note: 'Tipping 15–20% is expected and a core part of service workers\' income.' },
      { country: 'France', verdict: 'caution', note: 'Service is included by law; rounding up is a small, optional gesture.' },
      { country: 'China', verdict: 'caution', note: 'Traditionally not expected and sometimes refused, though changing in tourist hubs.' },
    ],
  },
  'thailand|showing-the-soles-of-your-feet': {
    verdict: 'rude', verdict_label: 'Highly disrespectful', confidence: 'high',
    explanation: 'In Thailand the feet are seen as the lowest and least clean part of the body, both literally and spiritually. Pointing your soles at a person, a Buddha image, or a portrait of the king is a serious sign of disrespect.',
    local_tip: 'Sit with your feet tucked behind you or flat on the floor, and never use your foot to point at people or objects.',
    regional_note: '',
    also_check: [
      { country: 'United States', verdict: 'polite', note: 'Putting your feet up is casual and carries no spiritual meaning.' },
      { country: 'India', verdict: 'rude', note: 'Feet are also considered impure; touching someone with your foot warrants an apology.' },
      { country: 'Japan', verdict: 'caution', note: 'Less charged, but pointing feet at someone is still seen as ill-mannered.' },
    ],
  },
  'india|eating-with-your-left-hand': {
    verdict: 'rude', verdict_label: 'Avoid the left hand', confidence: 'high',
    explanation: 'The left hand is traditionally associated with personal hygiene in India, so using it to eat or to pass food and items is considered unclean and impolite. The right hand is used for eating and giving.',
    local_tip: 'Eat, pass dishes, and hand over money or gifts with your right hand; it is fine to use the left only for holding a drink or serving spoon.',
    regional_note: 'The taboo is strongest in traditional and rural settings and more relaxed among younger people in big cities.',
    also_check: [
      { country: 'United Arab Emirates', verdict: 'rude', note: 'The same left-hand taboo applies strongly when eating or greeting.' },
      { country: 'United States', verdict: 'polite', note: 'No distinction — left-handed eating is completely normal.' },
      { country: 'Thailand', verdict: 'caution', note: 'Most eating is done with a spoon in the right hand, fork in the left.' },
    ],
  },
};

// ── DeepSeek call (build-time, direct — not via the Pages proxy) ─────────
function buildPrompt(gesture, country, context) {
  const cl = CONTEXT_LABELS[context] || context;
  return (
    'You are a world-class cultural etiquette expert with deep, specific knowledge of customs across every country.\n\n' +
    `Question: is "${gesture}" polite in ${country}? Context: ${cl}.\n\n` +
    'Rules:\n' +
    `1. Be specific to ${country} — no generic global advice.\n` +
    '2. The explanation must be factual and educational (2-3 sentences).\n' +
    '3. The local_tip must be actionable (one sentence).\n' +
    '4. "confidence": "high" = nearly universal, "medium" = generally true with exceptions, "low" = situational/contested.\n' +
    `5. "regional_note": flag regional/religious/generational variation within ${country}, or empty string if uniform.\n` +
    '6. "also_check": exactly 3 countries where this lands differently.\n\n' +
    'Respond ONLY with valid JSON — no markdown fences:\n' +
    '{"verdict":"polite"|"caution"|"rude","verdict_label":"3-5 word phrase","confidence":"high"|"medium"|"low","explanation":"...","local_tip":"...","regional_note":"...","also_check":[{"country":"..","verdict":"..","note":".."},{"country":"..","verdict":"..","note":".."},{"country":"..","verdict":"..","note":".."}]}'
  );
}

async function callDeepSeek(prompt) {
  const url = VIA_PROXY ? PROXY_URL : DIRECT_URL;
  const headers = { 'Content-Type': 'application/json' };
  if (!VIA_PROXY) headers['Authorization'] = `Bearer ${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a cultural etiquette expert. Respond only with valid JSON — no markdown fences.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3, max_tokens: 800,
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const raw = json.choices[0].message.content;
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/g, '').trim();
  return JSON.parse(cleaned);
}

// ── Cache ────────────────────────────────────────────────────────────────
function cachePath(cSlug, gSlug) { return join(CACHE_DIR, `${cSlug}__${gSlug}.json`); }
function readCache(cSlug, gSlug) {
  const p = cachePath(cSlug, gSlug);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
function writeCache(cSlug, gSlug, rec) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(cSlug, gSlug), JSON.stringify(rec, null, 2));
}

function writePage(relPath, html) {
  const full = join(OUT_DIR, relPath, 'index.html');
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
}

// ── Assemble the clean ./dist (app shell + functions only) ───────────────
function assembleBase() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  for (const f of STATIC_FILES) {
    const src = join(ROOT, f);
    if (existsSync(src)) copyFileSync(src, join(DIST, f));
    else console.warn(`  (skipped missing ${f})`);
  }
  if (existsSync(join(ROOT, 'functions'))) {
    cpSync(join(ROOT, 'functions'), join(DIST, 'functions'), { recursive: true });
  }
}

// ── Simple promise pool ──────────────────────────────────────────────────
async function pool(items, size, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: size }, async () => {
    while (queue.length) { const it = queue.shift(); await worker(it); }
  });
  await Promise.all(runners);
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  let pairs = allPairs();

  if (SAMPLE) {
    pairs = pairs.filter(p => SAMPLE_RECORDS[`${p.countrySlug}|${p.gestureSlug}`]);
    console.log(`[sample] rendering ${pairs.length} built-in pages (no API calls)`);
  } else if (VIA_PROXY) {
    console.log(`No local key — generating via deployed proxy: ${PROXY_URL}`);
  } else {
    console.log('Generating via DeepSeek API directly (local key set).');
  }

  console.log('Assembling ./dist (app shell + functions)…');
  assembleBase();

  // Resolve each pair's record (cache → sample → API), respecting LIMIT.
  let newCalls = 0, fromCache = 0, generated = 0;
  const records = new Map(); // key `${cSlug}|${gSlug}` -> rec

  await pool(pairs, SAMPLE ? 12 : CONCURRENCY, async (p) => {
    const key = `${p.countrySlug}|${p.gestureSlug}`;
    if (SAMPLE) {
      const rec = SAMPLE_RECORDS[key];
      writeCache(p.countrySlug, p.gestureSlug, rec); // persist so no-key reruns keep them
      records.set(key, rec);
      return;
    }
    const cached = readCache(p.countrySlug, p.gestureSlug);
    if (cached) { records.set(key, cached); fromCache++; return; }
    if (newCalls >= LIMIT) return; // leave for a later run
    newCalls++;
    try {
      const rec = await callDeepSeek(buildPrompt(p.gesture.display, p.country, p.gesture.context));
      writeCache(p.countrySlug, p.gestureSlug, rec);
      records.set(key, rec);
      generated++;
      console.log(`  ✓ ${p.country} / ${p.gesture.short}`);
    } catch (e) {
      console.warn(`  ✗ ${p.country} / ${p.gesture.short} — ${e.message}`);
    }
  });

  // Write pair pages + collect per-country records.
  const byCountry = new Map();
  let pageCount = 0;
  for (const p of pairs) {
    const rec = records.get(`${p.countrySlug}|${p.gestureSlug}`);
    if (!rec) continue;
    writePage(`${p.countrySlug}/${p.gestureSlug}`, renderPairPage(p, rec));
    pageCount++;
    if (!byCountry.has(p.country)) byCountry.set(p.country, []);
    byCountry.get(p.country).push({ gesture: p.gesture, rec });
  }

  // Country hubs.
  const countriesWithCounts = [];
  for (const [country, recs] of byCountry) {
    recs.sort((a, b) => GESTURES.indexOf(a.gesture) - GESTURES.indexOf(b.gesture));
    writePage(`${countrySlug(country)}`, renderCountryHub(country, recs));
    countriesWithCounts.push({ country, count: recs.length });
  }
  countriesWithCounts.sort((a, b) => COUNTRIES.indexOf(a.country) - COUNTRIES.indexOf(b.country));

  // SEO index.
  writePage('', renderSeoIndex(countriesWithCounts));

  // Sitemap → dist/sitemap.xml
  const urls = ['/', '/etiquette/'];
  for (const { country } of countriesWithCounts) urls.push(`/etiquette/${countrySlug(country)}/`);
  for (const p of pairs) if (records.get(`${p.countrySlug}|${p.gestureSlug}`)) urls.push(`/etiquette/${p.countrySlug}/${p.gestureSlug}/`);
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${BASE_URL}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
    `\n</urlset>\n`;
  writeFileSync(join(DIST, 'sitemap.xml'), sitemap);

  console.log('\n── Done ──');
  console.log(`pages written : ${pageCount} pairs + ${countriesWithCounts.length} hubs + 1 index`);
  if (!SAMPLE) console.log(`API calls     : ${generated} new, ${fromCache} from cache`);
  console.log(`sitemap URLs  : ${urls.length}`);
  console.log(`\nDeploy:  npx wrangler pages deploy dist --project-name isitpolite --branch main`);
}

main().catch(e => { console.error(e); process.exit(1); });
