import { originAllowed, json, vkeyOf, today, accuracyOf, sendEmail, escHtml, OWNER_EMAIL } from '../_shared.js';
import { rateLimit } from '../_rate.js';
import { runReportAgent } from '../_agent.js';

const CORROBORATION_THRESHOLD = 3;   // accepted disputes needed before accuracy moves
const DAILY_VKEY_CAP = 80;           // anti-flood: max accepted reports per verdict per day

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!originAllowed(request.headers.get('Origin'), request.headers.get('Sec-Fetch-Site'))) return json({ error: 'Forbidden.' }, 403);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await rateLimit(env, ip, 'report', 8, 60000))) {
    return json({ error: 'Too many submissions — please slow down a moment.' }, 429);
  }

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }

  const kind = body.kind;
  const gesture = String(body.gesture || '').slice(0, 200);
  const country = String(body.country || '').slice(0, 80);
  const context_ = String(body.context || 'general').slice(0, 40);
  const verdict = String(body.verdict || '').slice(0, 20);
  const verdictLabel = String(body.verdict_label || '').slice(0, 80);
  const correction = String(body.correction || '').slice(0, 600);

  if (!gesture || !country || (kind !== 'confirm' && kind !== 'dispute')) {
    return json({ error: 'Invalid report.' }, 400);
  }

  const vkey = vkeyOf(gesture, country, context_);
  const now = Date.now();
  const day = today();

  // Ensure the verdict row exists.
  try {
    await env.DB.prepare(
      `INSERT INTO verdicts (vkey, gesture, country, context, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(vkey) DO UPDATE SET updated_at = excluded.updated_at`
    ).bind(vkey, gesture, country, context_, now).run();
  } catch (_) {
    return json({ error: 'db' }, 500);
  }

  // ── CONFIRM: lightweight, no AI needed ────────────────────────────────
  if (kind === 'confirm') {
    await env.DB.prepare('UPDATE verdicts SET confirm_count = confirm_count + 1, updated_at = ? WHERE vkey = ?')
      .bind(now, vkey).run();
    return respondAccuracy(env, vkey, 'recorded');
  }

  // ── DISPUTE: agentic adjudication ─────────────────────────────────────
  if (!correction.trim()) return json({ error: 'A short explanation is required to report an inaccuracy.' }, 400);

  // Anti-flood cap (no identifiers — purely a per-verdict daily ceiling).
  try {
    const cap = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM reports WHERE vkey = ? AND kind = 'dispute' AND created_day = ?"
    ).bind(vkey, day).first();
    if (cap && cap.n >= DAILY_VKEY_CAP) return json({ ok: true, status: 'received' }); // quietly absorb
  } catch (_) {}

  // LangGraph agent: screen → corroborate → decide. Multi-step adjudication
  // that cross-checks the claim against established cultural knowledge before
  // accepting it, and returns a PII-stripped summary.
  let agent;
  try {
    agent = await runReportAgent(env, {
      gesture: gesture, country: country, context: context_,
      verdict: verdict, verdictLabel: verdictLabel, correction: correction,
    });
  } catch (_) {
    // If the agent is unavailable, fail safe: do NOT record (avoid unvetted data).
    return json({ ok: true, status: 'received' });
  }

  if (!agent.accepted) {
    // Don't reveal the filter to trolls — generic acknowledgement, store nothing.
    return json({ ok: true, status: 'received' });
  }

  // Store the agent's PII-stripped summary only — never the raw text.
  const summary = String(agent.summary || '').slice(0, 200);
  let promoted = false;
  let pendingCount = 1;
  try {
    await env.DB.prepare(
      "INSERT INTO reports (vkey, kind, status, summary, created_day) VALUES (?, 'dispute', 'accepted', ?, ?)"
    ).bind(vkey, summary, day).run();
    await env.DB.prepare('UPDATE verdicts SET pending_count = pending_count + 1, updated_at = ? WHERE vkey = ?')
      .bind(now, vkey).run();

    // Corroboration: only once enough independent accepted reports exist do they
    // count against accuracy — a lone report (or a troll who slipped through) never
    // moves the number on its own.
    const v = await env.DB.prepare('SELECT pending_count FROM verdicts WHERE vkey = ?').bind(vkey).first();
    pendingCount = v ? v.pending_count : 1;
    if (v && v.pending_count >= CORROBORATION_THRESHOLD) {
      await env.DB.prepare(
        'UPDATE verdicts SET dispute_count = dispute_count + pending_count, pending_count = 0, updated_at = ? WHERE vkey = ?'
      ).bind(now, vkey).run();
      await env.DB.prepare("UPDATE reports SET status = 'promoted' WHERE vkey = ? AND status = 'accepted'")
        .bind(vkey).run();
      promoted = true;
    }
  } catch (_) {
    return json({ error: 'db' }, 500);
  }

  // Notify the owner (anonymized) — the agent vetted it as a genuine, corroborated claim.
  const statusLine = promoted
    ? 'Corroborated — now counts toward the verdict\'s accuracy.'
    : 'Pending corroboration (' + pendingCount + '/' + CORROBORATION_THRESHOLD + ' independent reports).';
  context.waitUntil(sendEmail(env, {
    to: OWNER_EMAIL,
    subject: 'IsItPolite report: "' + gesture.replace(/[\r\n]+/g, ' ') + '" in ' + country.replace(/[\r\n]+/g, ' ') + (promoted ? ' (now corroborated)' : ''),
    html:
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px">' +
        '<h2 style="color:#4F46E5;margin:0 0 8px">Inaccuracy report (AI-vetted)</h2>' +
        '<p style="margin:0 0 4px"><strong>' + escHtml(gesture) + '</strong> in <strong>' + escHtml(country) + '</strong> · ' + escHtml(context_) + '</p>' +
        '<p style="margin:0 0 4px">Current verdict: <strong>' + escHtml(verdict) + '</strong>' + (verdictLabel ? ' (' + escHtml(verdictLabel) + ')' : '') + '</p>' +
        '<p style="margin:12px 0 4px"><strong>Claimed correction (anonymized):</strong></p>' +
        '<blockquote style="margin:0;padding:10px 14px;background:#EEF2FF;border-left:3px solid #4F46E5;border-radius:6px">' + escHtml(summary) + '</blockquote>' +
        '<p style="margin:12px 0 4px"><strong>Agent confidence:</strong> ' + escHtml(agent.confidence) + '</p>' +
        (agent.rationale ? '<p style="margin:0 0 4px"><strong>Agent rationale:</strong> ' + escHtml(agent.rationale) + '</p>' : '') +
        '<p style="margin:12px 0 4px"><strong>Status:</strong> ' + escHtml(statusLine) + '</p>' +
        '<p style="color:#888;font-size:12px;margin-top:14px">' + escHtml(today()) + ' · PII-stripped before sending.</p>' +
      '</div>',
  }).catch(function () {}));

  return respondAccuracy(env, vkey, 'received');
}

async function respondAccuracy(env, vkey, status) {
  const row = await env.DB.prepare('SELECT confirm_count, dispute_count FROM verdicts WHERE vkey = ?').bind(vkey).first();
  const confirm = row ? row.confirm_count : 0;
  const dispute = row ? row.dispute_count : 0;
  const a = accuracyOf(confirm, dispute);
  return json({ ok: true, status: status, confirm: confirm, dispute: dispute, accuracy: a.pct, total: a.total, accuracyStatus: a.status });
}
