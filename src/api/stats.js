// GET /api/stats → { total, last30Days, byMode, since }
// Public aggregate counts of answered lookups (no identifiers of any kind),
// so it is cacheable and readable from any origin.
import { getUsageStats } from '../_usage.js';

function statsResponse(body, status, cacheControl) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestGet(context) {
  try {
    const stats = await getUsageStats(context.env);
    return statsResponse(stats, 200, 'public, max-age=3600');
  } catch (e) {
    console.error('stats_failed', (e && e.message) || String(e));
    return statsResponse({ error: 'Stats unavailable.' }, 503, 'no-store');
  }
}
