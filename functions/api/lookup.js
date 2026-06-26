import { originAllowed, json, rateLimit } from '../_shared.js';
import { runLookupAgent } from '../_agent.js';

const MODES = ['check', 'compare', 'trip', 'guide', 'quiz'];

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

// POST /api/lookup  { mode, ...params } → retrieval-augmented agent result
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!originAllowed(request.headers.get('Origin'))) return json({ error: 'Forbidden.' }, 403);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await rateLimit(env, ip, 'lookup', 20, 60000))) {
    return json({ error: 'Too many requests — please slow down a moment.' }, 429);
  }

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }

  const mode = body.mode;
  if (MODES.indexOf(mode) === -1) return json({ error: 'Invalid request.' }, 400);

  const params = {
    gesture: String(body.gesture || '').slice(0, 200),
    country: String(body.country || '').slice(0, 80),
    context: String(body.context || 'general').slice(0, 40),
    from: String(body.from || '').slice(0, 80),
    to: String(body.to || '').slice(0, 80),
    countries: Array.isArray(body.countries) ? body.countries.slice(0, 3).map(function (c) { return String(c).slice(0, 80); }) : [],
  };

  try {
    const data = await runLookupAgent(env, mode, params);
    return json(data);
  } catch (e) {
    const msg = (e && e.message) === 'parse_failed'
      ? 'The response could not be parsed. Please try again.'
      : 'The lookup failed. Please try again.';
    return json({ error: msg }, 502);
  }
}
