// POST /api/contrast { gesture, country, context, home } → { home_contrast }
// Fills the "Coming from …" note for an instant answer. Only works for
// questions that match a fact-checked record, so it can't be used as a free
// general-purpose AI endpoint. Free, rate-limited.
import { originAllowed, json } from '../_shared.js';
import { rateLimit } from '../_rate.js';
import { isCountry, CONTEXT_LABELS } from '../_countries.js';
import { matchReviewed } from '../_reviewed-match.js';
import { homeContrast } from '../_agent.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!originAllowed(request.headers.get('Origin'), request.headers.get('Sec-Fetch-Site'))) return json({ error: 'Forbidden.' }, 403);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await rateLimit(env, ip, 'contrast', 20, 60000))) return json({ error: 'Too many requests — please slow down a moment.' }, 429);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'Bad request.' }, 400);

  const params = {
    gesture: String(body.gesture || '').slice(0, 200),
    country: body.country,
    context: Object.prototype.hasOwnProperty.call(CONTEXT_LABELS, body.context) ? body.context : 'general',
    home: body.home,
  };
  if (!isCountry(params.country) || !isCountry(params.home) || params.home === params.country) return json({ error: 'Invalid request.' }, 400);

  const match = matchReviewed(params);
  if (!match) return json({ error: 'Not available for this question.' }, 404);
  const homeMatch = matchReviewed({ gesture: match.item.gesture, country: params.home, context: 'general' });

  try {
    const note = await homeContrast(env, match.item, params.country, params.home, homeMatch && homeMatch.item);
    return json({ home_contrast: note });
  } catch (_) {
    return json({ error: 'Could not prepare the note.' }, 502);
  }
}
