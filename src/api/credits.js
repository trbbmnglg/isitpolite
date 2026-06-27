// GET /api/credits?code=XXXX-XXXX-XXXX-XXXX → dual-pool credit status
// Returns free daily allowances (read-only, no increment) + purchased pool balances.
// Rate-limited to prevent brute-force code enumeration.
//
// Response shape:
//   {
//     free: { search: {remaining,limit}, generation: {remaining,limit},
//             resetsLabel, resetsAt },
//     purchased: { valid, search: {remaining,total}, generation: {remaining,total} },
//     // Legacy top-level mirror (keeps existing badge/apply-code working):
//     valid, remaining, total
//   }
import { json, rateLimit, creditStatus, dailyRemaining, nextPacificMidnight, FREE_SEARCH_PER_DAY, FREE_GEN_PER_DAY } from '../_shared.js';

export function onRequestPost() {
  return json({ error: 'Method not allowed.' }, 405);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') || '';

  if (!(await rateLimit(env, ip, 'credits', 15, 60000))) {
    return json({ error: 'Too many requests. Please wait a moment.' }, 429);
  }

  const code = new URL(request.url).searchParams.get('code') || '';

  // Read free daily remaining (read-only — never increments the counter).
  const freeSearch = await dailyRemaining(env, ip, 'free_search', FREE_SEARCH_PER_DAY);
  const freeGen    = await dailyRemaining(env, ip, 'free_gen', FREE_GEN_PER_DAY);

  // Read purchased pool balances (no mutation on GET).
  const purchased = await creditStatus(env, code);

  return json({
    free: {
      search:     { remaining: freeSearch, limit: FREE_SEARCH_PER_DAY },
      generation: { remaining: freeGen,    limit: FREE_GEN_PER_DAY },
      resetsLabel: 'midnight Pacific',
      resetsAt:    nextPacificMidnight(),
    },
    purchased: {
      valid:      purchased.valid,
      search:     purchased.search,
      generation: purchased.generation,
    },
    // Legacy mirror — keeps existing badge / apply-code frontend working.
    valid:     purchased.valid,
    remaining: purchased.remaining,
    total:     purchased.total,
  });
}
