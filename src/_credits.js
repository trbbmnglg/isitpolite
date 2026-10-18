// Paid credit pool helpers and tier configuration.
// All consume/refund functions are FAIL CLOSED — a DB error must never grant paid value.
import { normalizeCode } from './_shared.js';

export const FREE_SEARCH_PER_DAY = 10;
export const FREE_GEN_PER_DAY    = 1;

export const TIER_CURRENCY = 'USD';

export const TIERS = {
  t1: { id: 't1', price: '10.00', search: 10, gen: 5,  label: 'Starter'      },
  t2: { id: 't2', price: '15.00', search: 20, gen: 7,  label: 'Traveler'     },
  t3: { id: 't3', price: '20.00', search: 30, gen: 10, label: 'Globetrotter' },
};

export function tierById(id) {
  return Object.prototype.hasOwnProperty.call(TIERS, id) ? TIERS[id] : null;
}

// Read both paid pools + legacy mirror. Returns the dual-pool shape used by /api/credits.
export async function creditStatus(env, code) {
  const c = normalizeCode(code);
  if (!c) return { valid: false, search: { remaining: 0, total: 0 }, generation: { remaining: 0, total: 0 }, remaining: 0, total: 0 };
  try {
    const row = await env.DB.prepare(
      'SELECT search_total, search_used, gen_total, gen_used, status FROM licenses WHERE code = ?'
    ).bind(c).first();
    if (!row) return { valid: false, search: { remaining: 0, total: 0 }, generation: { remaining: 0, total: 0 }, remaining: 0, total: 0 };

    // Pending (PayPal still reviewing) or revoked codes have no spendable credits.
    if (row.status && row.status !== 'active') {
      return { valid: false, status: row.status, search: { remaining: 0, total: row.search_total || 0 }, generation: { remaining: 0, total: row.gen_total || 0 }, remaining: 0, total: 0 };
    }
    const sRem = Math.max(0, (row.search_total || 0) - (row.search_used || 0));
    const gRem = Math.max(0, (row.gen_total    || 0) - (row.gen_used   || 0));
    return {
      valid: (sRem > 0 || gRem > 0),
      search:     { remaining: sRem, total: Math.max(0, row.search_total || 0) },
      generation: { remaining: gRem, total: Math.max(0, row.gen_total    || 0) },
      remaining: gRem, total: Math.max(0, row.gen_total || 0), // legacy mirror
    };
  } catch (_) {
    return { valid: false, search: { remaining: 0, total: 0 }, generation: { remaining: 0, total: 0 }, remaining: 0, total: 0 };
  }
}

export async function consumeSearchCredit(env, code) {
  const c = normalizeCode(code);
  if (!c) return { ok: false, reason: 'invalid_code' };
  try {
    const upd = await env.DB.prepare(
      "UPDATE licenses SET search_used = search_used + 1 WHERE code = ? AND search_used < search_total AND status = 'active'"
    ).bind(c).run();
    if (upd.meta && upd.meta.changes === 1) {
      const row = await env.DB.prepare('SELECT search_total, search_used FROM licenses WHERE code = ?').bind(c).first();
      return { ok: true, remaining: row ? Math.max(0, (row.search_total || 0) - (row.search_used || 0)) : 0 };
    }
    const row = await env.DB.prepare('SELECT search_total FROM licenses WHERE code = ?').bind(c).first();
    return { ok: false, reason: row ? 'no_credits' : 'invalid_code' };
  } catch (_) { return { ok: false, reason: 'db_error' }; }
}

export async function consumeGenerationCredit(env, code) {
  const c = normalizeCode(code);
  if (!c) return { ok: false, reason: 'invalid_code' };
  try {
    const upd = await env.DB.prepare(
      "UPDATE licenses SET gen_used = gen_used + 1 WHERE code = ? AND gen_used < gen_total AND status = 'active'"
    ).bind(c).run();
    if (upd.meta && upd.meta.changes === 1) {
      const row = await env.DB.prepare('SELECT gen_total, gen_used FROM licenses WHERE code = ?').bind(c).first();
      return { ok: true, remaining: row ? Math.max(0, (row.gen_total || 0) - (row.gen_used || 0)) : 0 };
    }
    const row = await env.DB.prepare('SELECT gen_total FROM licenses WHERE code = ?').bind(c).first();
    return { ok: false, reason: row ? 'no_credits' : 'invalid_code' };
  } catch (_) { return { ok: false, reason: 'db_error' }; }
}

export async function refundSearchCredit(env, code) {
  const c = normalizeCode(code);
  if (!c) return;
  try {
    await env.DB.prepare('UPDATE licenses SET search_used = search_used - 1 WHERE code = ? AND search_used > 0').bind(c).run();
  } catch (_) {}
}

export async function refundGenerationCredit(env, code) {
  const c = normalizeCode(code);
  if (!c) return;
  try {
    await env.DB.prepare('UPDATE licenses SET gen_used = gen_used - 1 WHERE code = ? AND gen_used > 0').bind(c).run();
  } catch (_) {}
}
