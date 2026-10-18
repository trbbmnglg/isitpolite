// Generate "etiquette for <demonym>" page content with the trip-briefing pipeline
// (both countries' fact-checked records + web sources), saved to seo-cache/origin/.
//
//   node scripts/generate-origin-pages.mjs           missing pages only
//   node scripts/generate-origin-pages.mjs --force   regenerate all
//
// Keys are read from .dev.vars (DEEPSEEK_API_KEY, TAVILY_API_KEY) and never printed.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGIN_PAGES, countrySlug } from '../seo/seo-data.mjs';
import { runLookupAgent } from '../src/_agent.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'seo-cache', 'origin');
const FORCE = process.argv.includes('--force');
const TODAY = new Date().toISOString().slice(0, 10);

const env = {};
const file = join(ROOT, '.dev.vars');
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
if (!env.DEEPSEEK_API_KEY || !env.TAVILY_API_KEY) { console.error('Missing DEEPSEEK_API_KEY or TAVILY_API_KEY in .dev.vars'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

for (const page of ORIGIN_PAGES) {
  for (const to of page.destinations) {
    const target = join(OUT, `${countrySlug(page.origin)}__${countrySlug(to)}.json`);
    if (existsSync(target) && !FORCE) { console.log(`  = ${page.origin} → ${to} (cached)`); continue; }
    try {
      const d = await runLookupAgent(env, 'brief', { from: page.origin, to, contexts: ['general', 'dining', 'business', 'family'], month: 0, home: '' });
      if ((d.watch_outs || []).length < 6) { console.log(`  - skipped (only ${d.watch_outs.length} points): ${to}`); continue; }
      writeFileSync(target, JSON.stringify({ ...d, grounded: TODAY }, null, 2) + '\n');
      console.log(`  ✓ ${page.origin} → ${to}: ${d.watch_outs.length} points, ${d.watch_outs.filter((w) => w.link).length} linked to reviewed pages`);
    } catch (e) {
      console.log(`  ✗ ${to}: ${e.message}`);
    }
  }
}
