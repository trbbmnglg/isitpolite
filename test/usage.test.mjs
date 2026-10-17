// Tests for the privacy-safe usage counter (src/_usage.js) and its hook in
// POST /api/lookup. Run with: npm test
//
// The LangGraph agent is replaced via mock.module so no LLM / network call is
// made; D1 is a small in-memory fake that records every statement.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

let agentImpl = async () => ({ verdict: 'polite', explanation: 'Fine.', also_check: [] });
mock.module(new URL('../src/_agent.js', import.meta.url).href, {
  namedExports: { runLookupAgent: (...args) => agentImpl(...args) },
});

const { shouldCountLookup, recordAnswered, getUsageStats, PROD_HOST } = await import('../src/_usage.js');
const { onRequestPost } = await import('../src/api/lookup.js');
const { onRequestGet: statsGet } = await import('../src/api/stats.js');

// ── Fakes ──────────────────────────────────────────────────────────────────
// opts.burstCount: value returned for the 'lookup:' burst rate-limit bucket.
// opts.usageFails: make the usage_daily upsert reject.
function fakeDB(opts = {}) {
  const calls = [];
  function answer(op, sql, args) {
    if (sql.includes('FROM meta')) return { v: 'test-salt' };
    if (sql.startsWith('SELECT count FROM rate')) {
      const bucket = String(args[0] || '');
      if (bucket.startsWith('lookup:')) return { count: opts.burstCount || 0 };
      return { count: 0 }; // free daily allowance untouched
    }
    if (sql.includes('INTO usage_daily') && opts.usageFails) throw new Error('D1 unavailable');
    if (op === 'all') return { results: opts.rows ? opts.rows(sql) : [] };
    return op === 'run' ? { meta: { changes: 1 } } : null;
  }
  return {
    calls,
    prepare(sql) {
      const stmt = {
        sql, args: [],
        bind(...a) { stmt.args = a; return stmt; },
        async first() { calls.push({ sql, args: stmt.args }); return answer('first', sql, stmt.args); },
        async run()   { calls.push({ sql, args: stmt.args }); return answer('run', sql, stmt.args); },
        async all()   { calls.push({ sql, args: stmt.args }); return answer('all', sql, stmt.args); },
      };
      return stmt;
    },
    async batch(stmts) { return Promise.all(stmts.map((s) => s.all())); },
  };
}

function lookupRequest(url, body, headers = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function runLookup({ url = `https://${PROD_HOST}/api/lookup`, body, headers, db }) {
  const pending = [];
  const env = { DB: db };
  const hdrs = headers || { Origin: new URL(url).origin };
  const request = lookupRequest(url, body, hdrs);
  const res = await onRequestPost({ request, env, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return { res, pending };
}

const usageWrites = (db) => db.calls.filter((c) => c.sql.includes('INTO usage_daily'));
const today = () => new Date().toISOString().slice(0, 10);
const CHECK = { mode: 'check', gesture: 'Thumbs up', country: 'Japan', context: 'general' };

// ── Pure counting rule ─────────────────────────────────────────────────────
test('shouldCountLookup: only 2xx answers for a known mode on the production host', () => {
  assert.equal(shouldCountLookup('https://isitpolite.com/api/lookup', 200, 'check'), true);
  for (const m of ['compare', 'trip', 'guide', 'quiz']) {
    assert.equal(shouldCountLookup('https://isitpolite.com/api/lookup', 200, m), true, m);
  }
  for (const status of [400, 402, 403, 405, 429, 500, 502]) {
    assert.equal(shouldCountLookup('https://isitpolite.com/api/lookup', status, 'check'), false, String(status));
  }
  for (const url of [
    'http://localhost:8787/api/lookup',
    'http://127.0.0.1:8787/api/lookup',
    'https://isitpolite.pages.dev/api/lookup',
    'https://abc123.isitpolite.pages.dev/api/lookup',
    'https://isitpolite.web-rbbjr.workers.dev/api/lookup',
    'https://isitpolite.com.evil.example/api/lookup',
  ]) {
    assert.equal(shouldCountLookup(url, 200, 'check'), false, url);
  }
  assert.equal(shouldCountLookup('https://isitpolite.com/api/lookup', 200, 'nope'), false);
  assert.equal(shouldCountLookup('not a url', 200, 'check'), false);
});

// ── Handler-level: what /api/lookup actually records ───────────────────────
test('a successful check on isitpolite.com is counted exactly once (day + mode only)', async () => {
  const db = fakeDB();
  const stub = { verdict: 'caution', verdict_label: 'Not customary', explanation: 'x', also_check: [] };
  agentImpl = async () => stub;
  const { res } = await runLookup({ body: CHECK, db });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), stub, 'response body is the agent result, unchanged');
  const writes = usageWrites(db);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /ON CONFLICT\(day, mode\) DO UPDATE SET answered = answered \+ 1/);
  assert.deepEqual(writes[0].args, [today(), 'check'], 'binds nothing but the UTC day and the mode');
});

test('agent failure (502) is not counted', async () => {
  const db = fakeDB();
  agentImpl = async () => { throw new Error('parse_failed'); };
  const { res } = await runLookup({ body: CHECK, db });
  assert.equal(res.status, 502);
  assert.equal(usageWrites(db).length, 0);
});

test('rate-limited (429) is not counted', async () => {
  const db = fakeDB({ burstCount: 20 });
  agentImpl = async () => ({ verdict: 'polite', explanation: 'x', also_check: [] });
  const { res } = await runLookup({ body: CHECK, db });
  assert.equal(res.status, 429);
  assert.equal(usageWrites(db).length, 0);
});

test('validation failures (400) are not counted', async () => {
  for (const body of [{ mode: 'nope' }, 'null', '{not json']) {
    const db = fakeDB();
    const { res } = await runLookup({ body, db });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(usageWrites(db).length, 0);
  }
});

test('successful answers on non-production hosts are not counted', async () => {
  agentImpl = async () => ({ verdict: 'polite', explanation: 'x', also_check: [] });
  for (const url of ['http://localhost:8787/api/lookup', 'https://isitpolite.web-rbbjr.workers.dev/api/lookup']) {
    const db = fakeDB();
    const { res } = await runLookup({ url, body: CHECK, db, headers: { 'Sec-Fetch-Site': 'same-origin' } });
    assert.equal(res.status, 200, url);
    assert.equal(usageWrites(db).length, 0, url);
  }
});

test('a failing usage write never affects the response', async () => {
  const db = fakeDB({ usageFails: true });
  agentImpl = async () => ({ verdict: 'polite', explanation: 'x', also_check: [] });
  const logged = mock.method(console, 'error', () => {});
  try {
    const { res } = await runLookup({ body: CHECK, db });
    assert.equal(res.status, 200);
    assert.equal(logged.mock.calls[0].arguments[0], 'usage_count_failed');
  } finally {
    logged.mock.restore();
  }
});

test('recordAnswered never throws, even with a broken context', () => {
  const logged = mock.method(console, 'error', () => {});
  try {
    assert.equal(recordAnswered({}, 'check', new Response('{}')), false);
  } finally {
    logged.mock.restore();
  }
});

// ── /api/stats ─────────────────────────────────────────────────────────────
test('getUsageStats zero-fills every mode and returns since=null when empty', async () => {
  const stats = await getUsageStats({ DB: fakeDB() });
  assert.deepEqual(stats, {
    total: 0, last30Days: 0, since: null,
    byMode: { check: 0, compare: 0, trip: 0, guide: 0, quiz: 0 },
  });
});

test('GET /api/stats aggregates totals and sends public cache + CORS headers', async () => {
  const db = fakeDB({
    rows: (sql) => sql.includes('GROUP BY mode')
      ? [{ mode: 'check', n: 7, first_day: '2026-10-18' }, { mode: 'quiz', n: 2, first_day: '2026-10-19' }]
      : [{ n: 9 }],
  });
  const res = await statsGet({ env: { DB: db } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=3600');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await res.json(), {
    total: 9, last30Days: 9, since: '2026-10-18',
    byMode: { check: 7, compare: 0, trip: 0, guide: 0, quiz: 2 },
  });
});
