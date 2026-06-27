// Shared helpers for the API Worker. Files prefixed with "_" are
// NOT routes — they're importable modules.

const ALLOWED_HOSTS = ['isitpolite.com', 'www.isitpolite.com', 'isitpolite.pages.dev', 'isitpolite.web-rbbjr.workers.dev'];

// Owner notification address (server-side only — not exposed to the browser).
export const OWNER_EMAIL = 'owner@example.invalid';

export function originAllowed(origin) {
  if (!origin) return true; // same-origin / server-side requests omit Origin
  try {
    const host = new URL(origin).hostname;
    return ALLOWED_HOSTS.includes(host) || host.endsWith('.isitpolite.pages.dev');
  } catch (_) { return false; }
}

export function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function vkeyOf(gesture, country, context) {
  return [
    String(gesture || '').toLowerCase().trim().replace(/\s+/g, ' '),
    String(country || '').trim(),
    String(context || 'general').trim(),
  ].join('|');
}

export function today() { return new Date().toISOString().slice(0, 10); }

export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Send an email via Resend. Key lives in env.RESEND_API_KEY (secret).
// Supports optional attachments: [{ filename, content }] where content is base64.
export async function sendEmail(env, opts) {
  if (!env.RESEND_API_KEY) return { skipped: true };
  try {
    const body = {
      from: opts.from || 'IsItPolite <onboarding@resend.dev>',
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.attachments && opts.attachments.length) body.attachments = opts.attachments;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status };
  } catch (_) {
    return { ok: false };
  }
}

export function accuracyOf(confirm, dispute) {
  const total = confirm + dispute;
  if (total < 3) return { pct: null, total: total, status: 'insufficient' };
  return { pct: Math.round((confirm / total) * 100), total: total, status: 'rated' };
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// Fixed-window rate limit, PII-free. Stores only name:SHA256(ip+secret_salt):window
// — an irreversible, salted token (NEVER the IP). Buckets auto-purge within minutes.
// Returns true if allowed, false if the limit is exceeded.
export async function rateLimit(env, ip, name, limit, windowMs) {
  try {
    // Random server-side salt (generated once, stored in D1; never the IP).
    let salt;
    const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'rl_salt'").first();
    if (row && row.v) {
      salt = row.v;
    } else {
      salt = crypto.randomUUID() + crypto.randomUUID();
      await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('rl_salt', ?)").bind(salt).run();
      const r2 = await env.DB.prepare("SELECT v FROM meta WHERE k = 'rl_salt'").first();
      if (r2 && r2.v) salt = r2.v;
    }

    const now = Date.now();
    const win = Math.floor(now / windowMs);
    const token = await sha256hex((ip || 'unknown') + '|' + salt);
    const bucket = name + ':' + token + ':' + win;

    const cur = await env.DB.prepare('SELECT count FROM rate WHERE bucket = ?').bind(bucket).first();
    if (cur && cur.count >= limit) return false;

    await env.DB.prepare(
      'INSERT INTO rate (bucket, count, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1'
    ).bind(bucket, now).run();

    // Opportunistic cleanup of expired buckets — scoped to this name so 24h daily
    // buckets (free_search/free_gen) are never wiped by a 60s-window cleanup.
    // B1 FIX: was global DELETE (wiped all buckets); now scoped to name:'%'.
    if (Math.random() < 0.08) {
      try {
        await env.DB.prepare('DELETE FROM rate WHERE bucket LIKE ? AND window_start < ?')
          .bind(name + ':%', now - windowMs * 3).run();
      } catch (_) {}
    }
    return true;
  } catch (_) {
    return true; // fail open — never block a genuine user if the limiter errors
  }
}

// Server-side AI call (build-time secret env.DEEPSEEK_API_KEY). Returns parsed JSON.
// The AI provider is never named in user-facing output.
export async function callAI(env, messages, maxTokens) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.2, max_tokens: maxTokens || 400 }),
  });
  if (!res.ok) throw new Error('ai_status_' + res.status);
  const j = await res.json();
  let raw = (j.choices && j.choices[0] && j.choices[0].message.content) || '';
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/g, '').trim();
  return JSON.parse(raw);
}

// ── Credit system config ─────────────────────────────────────────────────────
// All limits, prices, and tier definitions live here — no magic numbers in routes.

export const FREE_SEARCH_PER_DAY = 10;   // free lookups per day per visitor
export const FREE_GEN_PER_DAY    = 1;    // free artifact generations per day per visitor

// One-time top-up packs. Prices in TIER_CURRENCY. Labels are user-facing copy.
export const TIERS = {
  t1: { id: 't1', price: '10.00', search: 10, gen: 5,  label: 'Starter'      },
  t2: { id: 't2', price: '15.00', search: 20, gen: 7,  label: 'Traveler'     },
  t3: { id: 't3', price: '20.00', search: 30, gen: 10, label: 'Globetrotter' },
};

// Currency for all tier prices — must match the PayPal SDK currency_code.
// DECISION REQUIRED before going live: confirm USD vs PHP equivalent (see plan §7 OQ-1).
export const TIER_CURRENCY = 'USD';

// Resolve a tier by id string (allow-list guard — no ad-hoc branching in routes).
export function tierById(id) {
  return Object.prototype.hasOwnProperty.call(TIERS, id) ? TIERS[id] : null;
}

// LEGACY constants — kept so old import paths compile. Do not use for new mints.
export const CREDITS_PER_PURCHASE = 5;
export const PRICE = '2.99';
export const PAYPAL_CURRENCY = function (env) { return (env && env.PAYPAL_CURRENCY) || 'USD'; };

export function paypalBase(env) {
  return (env && env.PAYPAL_ENV === 'live')
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

// Crockford base32 alphabet — no I, L, O, U (easy to read, hard to mistype).
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Returns a new random unlock code: XXXX-XXXX-XXXX-XXXX (~80 bits entropy).
export function newUnlockCode() {
  const raw = new Uint8Array(16);
  crypto.getRandomValues(raw);
  let chars = '';
  for (let i = 0; i < 16; i++) chars += CROCKFORD[raw[i] % 32];
  return chars.slice(0, 4) + '-' + chars.slice(4, 8) + '-' + chars.slice(8, 12) + '-' + chars.slice(12, 16);
}

// Normalizes a user-supplied code to the canonical XXXX-XXXX-XXXX-XXXX form.
export function normalizeCode(s) {
  const upper = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (upper.length !== 16) return null;
  return upper.slice(0, 4) + '-' + upper.slice(4, 8) + '-' + upper.slice(8, 12) + '-' + upper.slice(12, 16);
}

// ── Pacific-calendar daily allowance helpers ─────────────────────────────────
// Free usage is capped per Pacific calendar day. The date is baked into the
// bucket key so rollover is automatic and DST-correct — no cron job needed.
// Reuses the same rate table and salt/token plumbing as rateLimit.

// Returns the current America/Los_Angeles calendar date as "YYYY-MM-DD".
// Centralised here so no other file ever does inline Intl calls or offset math.
export function pacificDay(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now || new Date());
}

// Returns the epoch-ms of the next midnight America/Los_Angeles.
export function nextPacificMidnight() {
  // Build "tomorrow 00:00:00 PT" by adding one day to today's midnight.
  var today = pacificDay();
  var parts = today.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + 1);
  // d is a local-time Date; convert the LA midnight correctly via Intl.
  // Simpler approach: find the start of tomorrow in LA time by searching forward.
  var now = Date.now();
  // Increment by up to 30h to find the next boundary.
  for (var ms = now + 60000; ms < now + 108000000; ms += 60000) {
    if (pacificDay(ms) !== pacificDay(now)) return ms;
  }
  return now + 86400000; // fallback
}

// Returns the PII-free daily-bucket key for (ip, bucketName, date).
// Format: "name:YYYY-MM-DD:sha256hex(ip|salt)"
// The salt is the same rl_salt used by rateLimit — loaded by the caller to avoid
// double DB reads; pass it in after loading.
function dailyBucketKey(name, day, token) {
  return name + ':' + day + ':' + token;
}

// Read the rate-limit salt from D1 (creating it once if absent).
// Exported so routes can share the load.
export async function getRlSalt(env) {
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'rl_salt'").first();
  if (row && row.v) return row.v;
  const salt = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('rl_salt', ?)").bind(salt).run();
  const r2 = await env.DB.prepare("SELECT v FROM meta WHERE k = 'rl_salt'").first();
  return (r2 && r2.v) ? r2.v : salt;
}

// Increment the free daily counter for (ip, name) and return { allowed, remaining }.
// FAILS OPEN: if the DB errors, the request is allowed (friendly + cost control only).
// The 60s burst rateLimit is the absolute flood gate; this is a soft daily ceiling.
export async function dailyAllowance(env, ip, name, limit) {
  try {
    const salt = await getRlSalt(env);
    const token = await sha256hex((ip || 'unknown') + '|' + salt);
    const day   = pacificDay();
    const bucket = dailyBucketKey(name, day, token);
    const now   = Date.now();

    const cur = await env.DB.prepare('SELECT count FROM rate WHERE bucket = ?').bind(bucket).first();
    const count = (cur && cur.count) ? cur.count : 0;

    if (count >= limit) return { allowed: false, remaining: 0 };

    // Increment.
    await env.DB.prepare(
      'INSERT INTO rate (bucket, count, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1'
    ).bind(bucket, now).run();

    // Opportunistic cleanup of stale daily buckets (>3 days old) for this name only.
    if (Math.random() < 0.08) {
      try {
        var cutoff = now - 3 * 86400000;
        await env.DB.prepare('DELETE FROM rate WHERE bucket LIKE ? AND window_start < ?')
          .bind(name + ':%', cutoff).run();
      } catch (_) {}
    }

    return { allowed: true, remaining: limit - count - 1 };
  } catch (_) {
    return { allowed: true, remaining: limit }; // fail open
  }
}

// Read-only version — returns remaining free uses today without incrementing.
// Safe to call from /api/credits badge refresh (does NOT count as a usage).
export async function dailyRemaining(env, ip, name, limit) {
  try {
    const salt = await getRlSalt(env);
    const token = await sha256hex((ip || 'unknown') + '|' + salt);
    const bucket = dailyBucketKey(name, pacificDay(), token);
    const cur = await env.DB.prepare('SELECT count FROM rate WHERE bucket = ?').bind(bucket).first();
    const used = (cur && cur.count) ? cur.count : 0;
    return Math.max(0, limit - used);
  } catch (_) {
    return limit; // fail open
  }
}

// Refund one free daily credit (call only after a confirmed failure that charged free).
export async function refundDaily(env, ip, name) {
  try {
    const salt = await getRlSalt(env);
    const token = await sha256hex((ip || 'unknown') + '|' + salt);
    const bucket = dailyBucketKey(name, pacificDay(), token);
    await env.DB.prepare(
      'UPDATE rate SET count = count - 1 WHERE bucket = ? AND count > 0'
    ).bind(bucket).run();
  } catch (_) {}
}

// ── Paid credit pool helpers ─────────────────────────────────────────────────
// These are FAIL CLOSED — a DB error must never grant paid value.

// Read both paid pools + legacy mirror. Returns the dual-pool shape used by
// /api/credits. Defensive reads handle NULL/0 new columns on pre-backfill rows.
export async function creditStatus(env, code) {
  const c = normalizeCode(code);
  if (!c) return { valid: false, search: { remaining: 0, total: 0 }, generation: { remaining: 0, total: 0 }, remaining: 0, total: 0 };
  try {
    const row = await env.DB.prepare(
      'SELECT credits_total, credits_used, search_total, search_used, gen_total, gen_used FROM licenses WHERE code = ?'
    ).bind(c).first();
    if (!row) return { valid: false, search: { remaining: 0, total: 0 }, generation: { remaining: 0, total: 0 }, remaining: 0, total: 0 };

    const sTotal = Math.max(0, row.search_total || 0);
    const sUsed  = Math.max(0, row.search_used  || 0);
    const gTotal = Math.max(0, row.gen_total    || 0);
    const gUsed  = Math.max(0, row.gen_used     || 0);
    const sRem   = Math.max(0, sTotal - sUsed);
    const gRem   = Math.max(0, gTotal - gUsed);

    return {
      valid: (sRem > 0 || gRem > 0),
      search:     { remaining: sRem, total: sTotal },
      generation: { remaining: gRem, total: gTotal },
      // Legacy mirror (top-level) — keeps the current badge / apply-code flow working.
      remaining: gRem,
      total:     gTotal,
    };
  } catch (_) {
    return { valid: false, search: { remaining: 0, total: 0 }, generation: { remaining: 0, total: 0 }, remaining: 0, total: 0 };
  }
}

// Atomic paid search-credit decrement. FAIL CLOSED.
export async function consumeSearchCredit(env, code) {
  const c = normalizeCode(code);
  if (!c) return { ok: false, reason: 'invalid_code' };
  try {
    const upd = await env.DB.prepare(
      'UPDATE licenses SET search_used = search_used + 1 WHERE code = ? AND search_used < search_total'
    ).bind(c).run();
    if (upd.meta && upd.meta.changes === 1) {
      const row = await env.DB.prepare('SELECT search_total, search_used FROM licenses WHERE code = ?').bind(c).first();
      const remaining = row ? Math.max(0, (row.search_total || 0) - (row.search_used || 0)) : 0;
      return { ok: true, remaining };
    }
    const row = await env.DB.prepare('SELECT search_total FROM licenses WHERE code = ?').bind(c).first();
    if (!row) return { ok: false, reason: 'invalid_code' };
    return { ok: false, reason: 'no_credits' };
  } catch (_) {
    return { ok: false, reason: 'db_error' }; // fail CLOSED
  }
}

// Atomic paid generation-credit decrement. FAIL CLOSED.
export async function consumeGenerationCredit(env, code) {
  const c = normalizeCode(code);
  if (!c) return { ok: false, reason: 'invalid_code' };
  try {
    const upd = await env.DB.prepare(
      'UPDATE licenses SET gen_used = gen_used + 1 WHERE code = ? AND gen_used < gen_total'
    ).bind(c).run();
    if (upd.meta && upd.meta.changes === 1) {
      const row = await env.DB.prepare('SELECT gen_total, gen_used FROM licenses WHERE code = ?').bind(c).first();
      const remaining = row ? Math.max(0, (row.gen_total || 0) - (row.gen_used || 0)) : 0;
      return { ok: true, remaining };
    }
    const row = await env.DB.prepare('SELECT gen_total FROM licenses WHERE code = ?').bind(c).first();
    if (!row) return { ok: false, reason: 'invalid_code' };
    return { ok: false, reason: 'no_credits' };
  } catch (_) {
    return { ok: false, reason: 'db_error' }; // fail CLOSED
  }
}

// Refund one paid search credit (call only after a confirmed failure).
export async function refundSearchCredit(env, code) {
  const c = normalizeCode(code);
  if (!c) return;
  try {
    await env.DB.prepare(
      'UPDATE licenses SET search_used = search_used - 1 WHERE code = ? AND search_used > 0'
    ).bind(c).run();
  } catch (_) {}
}

// Refund one paid generation credit (call only after a confirmed failure).
export async function refundGenerationCredit(env, code) {
  const c = normalizeCode(code);
  if (!c) return;
  try {
    await env.DB.prepare(
      'UPDATE licenses SET gen_used = gen_used - 1 WHERE code = ? AND gen_used > 0'
    ).bind(c).run();
  } catch (_) {}
}

// LEGACY credit helpers — kept for rollback safety; no longer called by any route.
// TODO: remove in a follow-up /refactoring pass once the new helpers are proven.
export async function consumeCredit(env, code) {
  const c = normalizeCode(code);
  if (!c) return { ok: false, reason: 'invalid_code' };
  try {
    const upd = await env.DB.prepare(
      'UPDATE licenses SET credits_used = credits_used + 1 WHERE code = ? AND credits_used < credits_total'
    ).bind(c).run();
    if (upd.meta && upd.meta.changes === 1) {
      const row = await env.DB.prepare(
        'SELECT credits_total, credits_used FROM licenses WHERE code = ?'
      ).bind(c).first();
      const remaining = row ? Math.max(0, row.credits_total - row.credits_used) : 0;
      return { ok: true, remaining };
    }
    const row = await env.DB.prepare('SELECT credits_total, credits_used FROM licenses WHERE code = ?').bind(c).first();
    if (!row) return { ok: false, reason: 'invalid_code' };
    return { ok: false, reason: 'no_credits' };
  } catch (_) {
    return { ok: false, reason: 'db_error' };
  }
}

export async function refundCredit(env, code) {
  const c = normalizeCode(code);
  if (!c) return;
  try {
    await env.DB.prepare(
      'UPDATE licenses SET credits_used = credits_used - 1 WHERE code = ? AND credits_used > 0'
    ).bind(c).run();
  } catch (_) {}
}
