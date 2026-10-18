// Generate missing etiquette pages with the same grounded pipeline as live Check
// (web search → draft → validate), so every new page ships with sources.
// A record is written to seo-cache/ only if the answer cites at least one https source.
//
//   node scripts/generate-pages.mjs              fill every missing gesture × country pair
//   node scripts/generate-pages.mjs --limit 10   stop after 10 new pages
//   node scripts/generate-pages.mjs --dry        list what would be generated
//
// Keys are read from .dev.vars (DEEPSEEK_API_KEY, TAVILY_API_KEY) and never printed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPairs } from '../seo/seo-data.mjs';
import { runLookupAgent } from '../src/_agent.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'seo-cache');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
const CONCURRENCY = 3;
const TODAY = new Date().toISOString().slice(0, 10);

function loadEnv() {
  const env = {};
  const file = join(ROOT, '.dev.vars');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
      if (m) env[m[1]] = m[2];
    }
  }
  for (const k of ['DEEPSEEK_API_KEY', 'TAVILY_API_KEY']) if (process.env[k]) env[k] = process.env[k];
  return env;
}

const env = loadEnv();
if (!DRY && (!env.DEEPSEEK_API_KEY || !env.TAVILY_API_KEY)) {
  console.error('Missing DEEPSEEK_API_KEY or TAVILY_API_KEY (.dev.vars or environment).');
  process.exit(1);
}

const todo = allPairs().filter((p) => !existsSync(join(CACHE, `${p.countrySlug}__${p.gestureSlug}.json`))).slice(0, LIMIT);
console.log(`${todo.length} missing pages${DRY ? ' (dry run)' : ''}`);
if (DRY) { todo.forEach((p) => console.log(`  ${p.country} / ${p.gesture.display}`)); process.exit(0); }

const stats = { written: 0, noSources: 0, failed: 0 };
let next = 0;
async function worker() {
  while (next < todo.length) {
    const p = todo[next++];
    const label = `${p.country} / ${p.gesture.short}`;
    try {
      const d = await runLookupAgent(env, 'check', { gesture: p.gesture.display, country: p.country, context: p.gesture.context, home: '' });
      // At least two cited sources, one of them not a forum: forum posts can
      // accompany a page but never carry it, and single-source pages are too thin.
      if (!d.sources || d.sources.length < 2 || !d.sources.some((s) => s.kind === 'reference')) {
        stats.noSources++; console.log(`  - skipped (needs 2+ sources incl. 1 non-forum): ${label}`); continue;
      }
      const rec = {
        verdict: String(d.verdict).toLowerCase(), verdict_label: d.verdict_label, confidence: d.confidence,
        explanation: d.explanation, local_tip: d.local_tip, regional_note: d.regional_note || '',
        also_check: (d.also_check || []).slice(0, 3),
        grounded: TODAY,
        sources: d.sources.map((s) => ({ title: s.title, url: s.url, kind: s.kind })),
      };
      writeFileSync(join(CACHE, `${p.countrySlug}__${p.gestureSlug}.json`), JSON.stringify(rec, null, 2) + '\n');
      stats.written++;
      console.log(`  ✓ ${label} (${rec.verdict}, ${rec.confidence}, ${rec.sources.length} sources)`);
    } catch (e) {
      stats.failed++;
      console.log(`  ✗ ${label}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(JSON.stringify(stats));
