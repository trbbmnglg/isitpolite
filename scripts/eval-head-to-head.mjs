// Head-to-head accuracy check: IsItPolite's live Check path vs general AI chats.
//
//   node scripts/eval-head-to-head.mjs [--n 20]
//
// Answer key: 20 fact-checked records from src/_reviewed.js, picked round-robin
// across countries with the verdicts kept balanced. Every contestant gets the
// same question and the same verdict definitions (src/_labels.js):
//   isitpolite   — runLookupAgent 'check' (web search + DeepSeek), the non-instant path
//   gpt-4o       — plain chat, no web
//   gpt-4o-web   — gpt-4o with OpenAI's web_search tool (ChatGPT-style answer with search)
//   deepseek     — our model with no web search (shows what retrieval adds)
// Google's answer box can't be queried automatically, so it isn't included.
//
// Caveat: the key is our own reviewed data, so treat the result as a sanity
// check, not a benchmark. Keys come from .dev.vars; results go to docs/eval/.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { REVIEWED } from '../src/_reviewed.js';
import { runLookupAgent } from '../src/_agent.js';
import { VERDICT_LEGEND } from '../src/_labels.js';
import { CONTEXT_LABELS } from '../src/_countries.js';

const N = (() => { const i = process.argv.indexOf('--n'); return i > 0 ? parseInt(process.argv[i + 1], 10) || 20 : 20; })();
const env = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]));

const VERDICTS = ['polite', 'caution', 'rude'];
const DEFS = VERDICT_LEGEND.map((l) => '"' + l.key + '" = ' + l.text).join('; ');

// ── Pick the questions ────────────────────────────────────────────────────
function pickQuestions(n) {
  const pools = Object.keys(REVIEWED).sort().map((country) =>
    REVIEWED[country].items.filter((i) => VERDICTS.includes(i.verdict)).map((i) => ({ country, ...i })));
  const picked = [], tally = { polite: 0, caution: 0, rude: 0 }, perGesture = {};
  for (let round = 0; picked.length < n && round < 50; round++) {
    for (const pool of pools) {
      if (picked.length >= n) break;
      // Take the item whose verdict is least represented so far; prefer high confidence.
      // At most 2 questions per gesture, so one topic (e.g. tipping) can't dominate.
      const options = pool.filter((i) => !picked.includes(i) && (perGesture[i.key] || 0) < 2)
        .sort((a, b) => tally[a.verdict] - tally[b.verdict] || (b.confidence === 'high') - (a.confidence === 'high'));
      if (!options.length) continue;
      picked.push(options[0]); tally[options[0].verdict]++; perGesture[options[0].key] = (perGesture[options[0].key] || 0) + 1;
    }
  }
  return picked;
}

function questionText(q) {
  return 'Is "' + q.gesture + '" polite in ' + q.country + '? Setting: ' + (CONTEXT_LABELS[q.context] || q.context) + '.';
}
const ASK = 'Classify it with exactly one verdict using these definitions: ' + DEFS +
  '. Reply ONLY with JSON: {"verdict":"polite"|"caution"|"rude","explanation":"2 sentences"}';

function parseVerdict(text) {
  const raw = String(text || '');
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    const v = m && String(JSON.parse(m[0]).verdict || '').toLowerCase();
    if (VERDICTS.includes(v)) return v;
  } catch (_) {}
  const hit = raw.toLowerCase().match(/"?verdict"?\s*[:=]\s*"?(polite|caution|rude)/);
  return hit ? hit[1] : null;
}

async function openai(model, q, extra) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ model, messages: [{ role: 'user', content: questionText(q) + '\n\n' + ASK }] }, extra || {})),
  });
  const j = await res.json();
  if (!res.ok) throw new Error((j.error && j.error.message) || res.status);
  const msg = j.choices[0].message;
  const cites = (msg.annotations || []).filter((a) => a.type === 'url_citation').map((a) => a.url_citation.url);
  return { verdict: parseVerdict(msg.content), sources: [...new Set(cites)].length, ourSite: cites.some((u) => /isitpolite\.com/.test(u)) };
}

// ChatGPT-style answer with web search: Responses API + the web_search tool.
async function openaiWeb(q) {
  let lastErr;
  for (const tool of ['web_search', 'web_search_preview']) {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o', tools: [{ type: tool }], tool_choice: 'required', input: questionText(q) + '\n\n' + ASK }),
    });
    const j = await res.json();
    if (!res.ok) { lastErr = new Error((j.error && j.error.message) || res.status); continue; }
    const parts = (j.output || []).filter((o) => o.type === 'message').flatMap((o) => o.content || []).filter((c) => c.type === 'output_text');
    const cites = parts.flatMap((c) => c.annotations || []).filter((a) => a.type === 'url_citation').map((a) => a.url);
    return { verdict: parseVerdict(parts.map((c) => c.text).join('\n')), sources: [...new Set(cites)].length, ourSite: cites.some((u) => /isitpolite\.com/.test(u)) };
  }
  throw lastErr;
}

async function deepseekPlain(q) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.2, messages: [{ role: 'user', content: questionText(q) + '\n\n' + ASK }] }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error((j.error && j.error.message) || res.status);
  return { verdict: parseVerdict(j.choices[0].message.content), sources: 0, ourSite: false };
}

async function isitpolite(q) {
  const d = await runLookupAgent(env, 'check', { gesture: q.gesture, country: q.country, context: q.context, home: '' });
  const urls = (d.sources || []).map((s) => s.url);
  return {
    verdict: String(d.verdict || '').toLowerCase(), sources: urls.length, confidence: d.confidence,
    ourSite: urls.some((u) => /isitpolite\.com/.test(u)), forumOnly: !!d.forum_only,
  };
}

const CONTESTANTS = {
  'isitpolite': isitpolite,
  'gpt-4o': (q) => openai('gpt-4o', q, { temperature: 0.2 }),
  'gpt-4o-web': openaiWeb,
  'deepseek': deepseekPlain,
};

// polite↔rude is the costly mistake: telling someone a rude thing is fine (or the reverse).
function grade(expected, got) {
  if (!got) return 'no_answer';
  if (got === expected) return 'match';
  return Math.abs(VERDICTS.indexOf(got) - VERDICTS.indexOf(expected)) === 2 ? 'opposite' : 'near';
}

async function timed(fn) {
  const t = Date.now();
  try { return Object.assign(await fn(), { ms: Date.now() - t }); }
  catch (e) { return { verdict: null, error: String(e.message || e).slice(0, 160), ms: Date.now() - t }; }
}

const questions = pickQuestions(N);
console.log('questions:', questions.length, JSON.stringify(questions.reduce((t, q) => (t[q.verdict] = (t[q.verdict] || 0) + 1, t), {})));

const rows = [];
for (const q of questions) {
  const answers = Object.fromEntries(await Promise.all(Object.entries(CONTESTANTS).map(async ([name, fn]) => [name, await timed(() => fn(q))])));
  for (const a of Object.values(answers)) a.grade = grade(q.verdict, a.verdict);
  rows.push({ country: q.country, gesture: q.gesture, context: q.context, expected: q.verdict, expectedConfidence: q.confidence, answers });
  console.log(q.country.padEnd(16), q.gesture.slice(0, 34).padEnd(35), q.verdict.padEnd(8),
    Object.entries(answers).map(([n, a]) => n + '=' + (a.verdict || 'ERR') + (a.grade === 'match' ? '' : '*')).join('  '));
}

const summary = Object.fromEntries(Object.keys(CONTESTANTS).map((name) => {
  const as = rows.map((r) => r.answers[name]);
  const count = (g) => as.filter((a) => a.grade === g).length;
  const answered = as.filter((a) => a.verdict).length;
  return [name, {
    match: count('match'), near: count('near'), opposite: count('opposite'), no_answer: count('no_answer'),
    accuracy: answered ? Math.round((count('match') / rows.length) * 100) : 0,
    with_sources: as.filter((a) => a.sources > 0).length,
    cited_isitpolite: as.filter((a) => a.ourSite).length,
    median_ms: as.map((a) => a.ms).sort((x, y) => x - y)[Math.floor(as.length / 2)],
  }];
}));
console.table(summary);

const day = new Date().toISOString().slice(0, 10);
mkdirSync(new URL('../docs/eval/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/eval/head-to-head-' + day + '.json', import.meta.url), JSON.stringify({ day, n: rows.length, summary, rows }, null, 2));
console.log('wrote docs/eval/head-to-head-' + day + '.json');
process.exit(0);
