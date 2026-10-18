// Event counters, instant fact-checked answers, /api/contrast and shared-trip links.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let agentCalls = 0;
let contrastImpl = async () => 'At home you would tip; here you do not.';
mock.module(new URL('../src/_agent.js', import.meta.url).href, {
  namedExports: {
    runLookupAgent: async () => { agentCalls++; return { verdict: 'polite', explanation: 'x', also_check: [] }; },
    homeContrast: (...a) => contrastImpl(...a),
  },
});

const { onRequestPost: lookupPost } = await import('../src/api/lookup.js');
const { onRequestPost: eventPost } = await import('../src/api/event.js');
const { onRequestPost: contrastPost } = await import('../src/api/contrast.js');
const { matchReviewed, normalizeGesture } = await import('../src/_reviewed-match.js');
const { REVIEWED } = await import('../src/_reviewed.js');
const { COUNTRIES, CONTEXT_LABELS, MONTHS } = await import('../src/_countries.js');

function fakeDB(opts = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...a) { stmt.args = a; return stmt; },
        async first() {
          calls.push({ sql, args: stmt.args });
          if (sql.includes('FROM meta')) return { v: 'salt' };
          if (sql.startsWith('SELECT count FROM rate')) return { count: opts.burst || 0 };
          return null;
        },
        async run() { calls.push({ sql, args: stmt.args }); return { meta: { changes: 1 } }; },
        async all() { calls.push({ sql, args: stmt.args }); return { results: [] }; },
      };
      return stmt;
    },
  };
}

async function post(handler, path, body, { host = 'isitpolite.com', db = fakeDB() } = {}) {
  const pending = [];
  const request = new Request(`https://${host}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `https://${host}`, 'CF-Connecting-IP': '203.0.113.5' },
    body: JSON.stringify(body),
  });
  const res = await handler({ request, env: { DB: db }, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return { res, db };
}

const writesTo = (db, table) => db.calls.filter((c) => c.sql.includes('INTO ' + table));

// A real reviewed record to drive the instant-path tests.
const [rCountry, rData] = Object.entries(REVIEWED)[0];
const rItem = rData.items[0];

test('events: allow-listed names are counted on production only, as day + name', async () => {
  const ok = await post(eventPost, '/api/event', { event: 'share_brief' });
  assert.equal(ok.res.status, 204);
  const w = writesTo(ok.db, 'events_daily');
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].args, [new Date().toISOString().slice(0, 10), 'share_brief']);

  assert.equal(writesTo((await post(eventPost, '/api/event', { event: 'made_up' })).db, 'events_daily').length, 0);
  assert.equal(writesTo((await post(eventPost, '/api/event', { event: 'share_brief' }, { host: 'isitpolite.web-rbbjr.workers.dev' })).db, 'events_daily').length, 0);
  assert.equal((await post(eventPost, '/api/event', { event: 'share_brief' }, { db: fakeDB({ burst: 30 }) })).res.status, 429);
});

test('matchReviewed: exact display or short name, and only in a matching context', () => {
  assert.equal(normalizeGesture('  The OK hand-sign! '), 'ok hand sign');
  assert.ok(matchReviewed({ gesture: rItem.gesture, country: rCountry, context: rItem.context }));
  assert.ok(matchReviewed({ gesture: rItem.short.toUpperCase(), country: rCountry, context: 'general' }));
  const other = Object.keys(CONTEXT_LABELS).find((c) => c !== 'general' && c !== rItem.context);
  assert.equal(matchReviewed({ gesture: rItem.gesture, country: rCountry, context: other }), null);
  assert.equal(matchReviewed({ gesture: rItem.gesture + ' loudly', country: rCountry, context: 'general' }), null);
  assert.equal(matchReviewed({ gesture: rItem.gesture, country: 'Iceland', context: 'general' }), null);
});

test('instant answers skip the AI and the daily allowance, and are still counted', async () => {
  agentCalls = 0;
  const { res, db } = await post(lookupPost, '/api/lookup', { mode: 'check', gesture: rItem.gesture, country: rCountry, context: rItem.context });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.instant, true);
  assert.equal(d.verdict, rItem.verdict);
  assert.equal(d.guide_url, `/etiquette/${rData.slug}/${rItem.key}/`);
  assert.equal(agentCalls, 0, 'no AI call');
  assert.equal(db.calls.some((c) => c.args.some((a) => String(a).includes('free_search'))), false, 'no credit touched');
  assert.equal(writesTo(db, 'usage_daily').length, 1);
  assert.deepEqual(writesTo(db, 'events_daily').map((c) => c.args[1]), ['instant_answer']);
});

test('/api/contrast only works for fact-checked questions and validates its input', async () => {
  const good = { gesture: rItem.gesture, country: rCountry, context: rItem.context, home: rCountry === 'Philippines' ? 'Japan' : 'Philippines' };
  const ok = await post(contrastPost, '/api/contrast', good);
  assert.equal(ok.res.status, 200);
  assert.match((await ok.res.json()).home_contrast, /tip/);
  assert.equal((await post(contrastPost, '/api/contrast', { ...good, gesture: 'Juggling at funerals' })).res.status, 404);
  assert.equal((await post(contrastPost, '/api/contrast', { ...good, home: 'Narnia' })).res.status, 400);
  assert.equal((await post(contrastPost, '/api/contrast', { ...good, home: rCountry })).res.status, 400);
  assert.equal((await post(contrastPost, '/api/contrast', good, { db: fakeDB({ burst: 20 }) })).res.status, 429);
});

test('shared trip links are validated before they prefill anything', () => {
  const ctx = vm.createContext({ COUNTRIES, CONTEXT_LABELS, MONTHS, URLSearchParams });
  vm.runInContext(readFileSync(new URL('../src/js/brief.js', import.meta.url), 'utf8'), ctx);
  const parse = (q) => ctx.parseTripParams(new URLSearchParams(q));
  assert.deepEqual(JSON.parse(JSON.stringify(parse('tf=Philippines&tt=Japan&tc=dining,hack,dining&tm=3'))),
    { from: 'Philippines', to: 'Japan', contexts: ['dining'], month: 3 });
  assert.deepEqual(JSON.parse(JSON.stringify(parse('tf=Philippines&tt=Japan&tm=13'))).month, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(parse('tf=Philippines&tt=Japan'))).contexts, ['general']);
  assert.equal(parse('tf=Philippines&tt=Philippines'), null);
  assert.equal(parse('tf=Philippines&tt=Mars'), null);
  assert.equal(parse('g=x&c=Japan'), null);
  assert.match(ctx.tripLink({ from: 'Philippines', to: 'Japan', contexts: ['dining'], month: 3 }), /^https:\/\/isitpolite\.com\/\?tf=Philippines&tt=Japan&tc=dining&tm=3#\/trip$/);
});
