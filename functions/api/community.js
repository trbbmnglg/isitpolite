import { json, accuracyOf } from '../_shared.js';

// GET /api/community  → aggregate, PII-free community accuracy stats
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const totals = await env.DB.prepare(
      'SELECT COUNT(*) AS verdicts, COALESCE(SUM(confirm_count),0) AS confirms, COALESCE(SUM(dispute_count),0) AS disputes FROM verdicts'
    ).first();

    const ratedRows = await env.DB.prepare(
      `SELECT gesture, country, context, confirm_count, dispute_count
       FROM verdicts
       WHERE (confirm_count + dispute_count) >= 3
       ORDER BY (confirm_count + dispute_count) DESC
       LIMIT 60`
    ).all();

    const rows = (ratedRows && ratedRows.results) ? ratedRows.results : [];
    const mapped = rows.map(function (r) {
      const a = accuracyOf(r.confirm_count, r.dispute_count);
      return {
        gesture: r.gesture, country: r.country, context: r.context,
        confirm: r.confirm_count, dispute: r.dispute_count,
        accuracy: a.pct, total: a.total,
      };
    });

    const confirms = totals ? totals.confirms : 0;
    const disputes = totals ? totals.disputes : 0;
    const overall = (confirms + disputes) > 0 ? Math.round((confirms / (confirms + disputes)) * 100) : null;

    const mostConfirmed = mapped.slice().sort(function (a, b) { return b.confirm - a.confirm; }).slice(0, 8);
    const mostDisputed = mapped.filter(function (m) { return m.dispute > 0; })
      .sort(function (a, b) { return b.dispute - a.dispute; }).slice(0, 8);

    return json({
      verdicts_tracked: totals ? totals.verdicts : 0,
      total_confirms: confirms,
      total_disputes: disputes,
      overall_accuracy: overall,
      rated_count: mapped.length,
      most_confirmed: mostConfirmed,
      most_disputed: mostDisputed,
    });
  } catch (_) {
    return json({ error: 'db' }, 500);
  }
}
