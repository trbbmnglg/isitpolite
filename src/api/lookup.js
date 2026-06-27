import { originAllowed, json, normalizeCode } from '../_shared.js';
import { rateLimit, dailyAllowance, refundDaily } from '../_rate.js';
import { consumeSearchCredit, refundSearchCredit, FREE_SEARCH_PER_DAY } from '../_credits.js';
import { runLookupAgent } from '../_agent.js';

const MODES = ['check', 'compare', 'trip', 'guide', 'quiz'];

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

// POST /api/lookup  { mode, unlock?, ...params } → retrieval-augmented agent result
//
// Credit flow (in order):
//   1. Free daily allowance (FREE_SEARCH_PER_DAY / day, per IP token, Pacific date).
//      → fails OPEN: if the DB errors, the request is allowed.
//   2. If daily exhausted and no code → 402 daily_exhausted (open upsell modal).
//   3. If daily exhausted and code provided → deduct from paid search pool (fail CLOSED).
//   Free-before-paid: paid credits are NEVER touched while free credits remain.
export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') || '';

  // ── 1. Origin guard ───────────────────────────────────────────────────────
  if (!originAllowed(request.headers.get('Origin'))) return json({ error: 'Forbidden.' }, 403);

  // ── 2. Burst rate limit (20 / 60s per IP — orthogonal flood control) ──────
  if (!(await rateLimit(env, ip, 'lookup', 20, 60000))) {
    return json({ error: 'Too many requests — please slow down a moment.' }, 429);
  }

  // ── 3. Parse + validate ───────────────────────────────────────────────────
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }

  const mode = body.mode;
  if (MODES.indexOf(mode) === -1) return json({ error: 'Invalid request.' }, 400);

  // Optional paid-credit code — normalizeCode returns null if absent/malformed.
  const code = normalizeCode(body.unlock || '');

  const params = {
    gesture:   String(body.gesture   || '').slice(0, 200),
    country:   String(body.country   || '').slice(0, 80),
    context:   String(body.context   || 'general').slice(0, 40),
    from:      String(body.from      || '').slice(0, 80),
    to:        String(body.to        || '').slice(0, 80),
    countries: Array.isArray(body.countries) ? body.countries.slice(0, 3).map(function (c) { return String(c).slice(0, 80); }) : [],
  };

  // ── 4. Credit gate ────────────────────────────────────────────────────────
  var charged;  // { kind: 'free' } | { kind: 'paid', code }

  const free = await dailyAllowance(env, ip, 'free_search', FREE_SEARCH_PER_DAY);
  if (free.allowed) {
    charged = { kind: 'free' };
  } else {
    // Free allowance exhausted — try the paid pool.
    if (!code) {
      return json({
        error: 'You have used your ' + FREE_SEARCH_PER_DAY + ' free checks for today. They reset at midnight Pacific time. Add a credit pack to keep going.',
        reason: 'daily_exhausted',
        upsell: true,
      }, 402);
    }
    const paid = await consumeSearchCredit(env, code);
    if (!paid.ok) {
      // Identical response whether the code is invalid, depleted, or hit a
      // transient error — so a code's existence can't be probed (no oracle).
      return json({
        error: 'This unlock code has no credits left, or is not valid. Add a pack to keep going.',
        reason: 'no_credits', upsell: true,
      }, 402);
    }
    charged = { kind: 'paid', code: code };
  }

  // ── 5. Run the lookup agent ───────────────────────────────────────────────
  try {
    const data = await runLookupAgent(env, mode, params);
    return json(data);
  } catch (e) {
    // Refund whichever pool was charged before the agent failed.
    if (charged.kind === 'free') {
      await refundDaily(env, ip, 'free_search');
    } else {
      await refundSearchCredit(env, charged.code);
    }
    const msg = (e && e.message) === 'parse_failed'
      ? 'The response could not be parsed. Please try again.'
      : 'The lookup failed. Please try again.';
    return json({ error: msg }, 502);
  }
}
