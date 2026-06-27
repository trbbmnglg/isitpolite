import { originAllowed, json, today, sendEmail, escHtml, OWNER_EMAIL } from '../_shared.js';
import { rateLimit } from '../_rate.js';
import { sanitizeFeedback } from '../_agent.js';

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

// POST /api/feedback  { message }
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!originAllowed(request.headers.get('Origin'))) return json({ error: 'Forbidden.' }, 403);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await rateLimit(env, ip, 'feedback', 5, 60000))) {
    return json({ error: 'Too many submissions — please slow down a moment.' }, 429);
  }

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }

  const message = String(body.message || '').trim().slice(0, 1000);
  if (message.length < 3) return json({ error: 'Please write a little more.' }, 400);

  // LangChain agent: paraphrase + strip PII + classify sentiment. Never store raw input.
  let ai;
  try {
    ai = await sanitizeFeedback(env, message);
  } catch (_) {
    return json({ ok: true }); // fail open to the user, store nothing
  }

  if (!ai || ai.is_spam) return json({ ok: true });

  const summary = String(ai.sanitized_summary || '').slice(0, 200);
  const sentiment = ['positive', 'neutral', 'negative'].includes(ai.sentiment) ? ai.sentiment : 'neutral';
  if (!summary) return json({ ok: true });

  try {
    await env.DB.prepare('INSERT INTO feedback (summary, sentiment, created_day) VALUES (?, ?, ?)')
      .bind(summary, sentiment, today()).run();
  } catch (_) {
    return json({ error: 'db' }, 500);
  }

  // Notify the owner by email (anonymized summary only). Fire-and-forget so the
  // user's response isn't delayed by the send.
  context.waitUntil(sendEmail(env, {
    to: OWNER_EMAIL,
    subject: 'New IsItPolite feedback (' + sentiment + ')',
    html:
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px">' +
        '<h2 style="color:#4F46E5;margin:0 0 8px">New feedback on IsItPolite.com</h2>' +
        '<p style="margin:0 0 4px"><strong>Sentiment:</strong> ' + escHtml(sentiment) + '</p>' +
        '<p style="margin:12px 0 4px"><strong>Anonymized summary:</strong></p>' +
        '<blockquote style="margin:0;padding:10px 14px;background:#EEF2FF;border-left:3px solid #4F46E5;border-radius:6px">' + escHtml(summary) + '</blockquote>' +
        '<p style="color:#888;font-size:12px;margin-top:14px">' + escHtml(today()) + ' · PII-stripped before sending. Reply-to is not available (anonymous).</p>' +
      '</div>',
  }).catch(function () {}));

  return json({ ok: true });
}
