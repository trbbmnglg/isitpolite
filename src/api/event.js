// POST /api/event { event } → 204. Counts an allow-listed product event for
// today (day + name only). Unknown names are accepted and ignored, so clients
// can't probe the list and a bad name never surfaces as an error.
import { originAllowed, json } from '../_shared.js';
import { rateLimit } from '../_rate.js';
import { recordEvent } from '../_events.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!originAllowed(request.headers.get('Origin'), request.headers.get('Sec-Fetch-Site'))) return json({ error: 'Forbidden.' }, 403);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await rateLimit(env, ip, 'event', 30, 60000))) return json({ error: 'Too many requests.' }, 429);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'Bad request.' }, 400);

  recordEvent(context, String(body.event || '').slice(0, 40));
  return new Response(null, { status: 204 });
}
