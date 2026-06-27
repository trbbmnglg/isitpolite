import { json, vkeyOf, accuracyOf } from '../_shared.js';

// GET /api/accuracy?g=...&c=...&ctx=...  → community accuracy for one verdict
export async function onRequestGet(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  const g = u.searchParams.get('g'), c = u.searchParams.get('c'), ctx = u.searchParams.get('ctx') || 'general';
  if (!g || !c) return json({ error: 'Missing params.' }, 400);

  const vkey = vkeyOf(g, c, ctx);
  let row = null;
  try {
    row = await env.DB.prepare(
      'SELECT confirm_count, dispute_count FROM verdicts WHERE vkey = ?'
    ).bind(vkey).first();
  } catch (_) {
    return json({ error: 'db' }, 500);
  }

  const confirm = row ? row.confirm_count : 0;
  const dispute = row ? row.dispute_count : 0;
  const a = accuracyOf(confirm, dispute);
  return json({ confirm: confirm, dispute: dispute, accuracy: a.pct, total: a.total, status: a.status });
}
