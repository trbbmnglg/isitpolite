// Privacy-safe usage counter — aggregate daily counts of answered lookups.
// PII-FREE BY DESIGN: a row is only (UTC day, mode, count). No IP or hash of
// it, no user agent, no visitor country, no gesture or request text.
import { today, LOOKUP_MODE_NAMES, EVENT_NAMES } from './_shared.js';

// Only the production host counts — never localhost, *.pages.dev or
// *.workers.dev previews/staging.
export const PROD_HOST = 'isitpolite.com';

// Counting rule: a 2xx /api/lookup response for a known mode, served on the
// production host. Pure, so the rule can be unit-tested on its own.
export function shouldCountLookup(requestUrl, status, mode) {
  let host;
  try { host = new URL(requestUrl).hostname; } catch (_) { return false; }
  return host === PROD_HOST &&
    status >= 200 && status < 300 &&
    LOOKUP_MODE_NAMES.indexOf(mode) !== -1;
}

export async function incrementUsage(env, mode, day) {
  await env.DB.prepare(
    'INSERT INTO usage_daily (day, mode, answered) VALUES (?1, ?2, 1) ' +
    'ON CONFLICT(day, mode) DO UPDATE SET answered = answered + 1'
  ).bind(day || today(), mode).run();
}

// Schedules the increment in waitUntil so it can never slow or fail the
// user's response. Never throws; DB errors are logged and swallowed.
export function recordAnswered(context, mode, response) {
  try {
    if (!shouldCountLookup(context.request.url, response.status, mode)) return false;
    context.waitUntil(incrementUsage(context.env, mode).catch(function (e) {
      console.error('usage_count_failed', (e && e.message) || String(e));
    }));
    return true;
  } catch (e) {
    console.error('usage_count_failed', (e && e.message) || String(e));
    return false;
  }
}

// Aggregates for GET /api/stats. last30Days = the 30 UTC days including today.
export async function getUsageStats(env, now) {
  const since30 = new Date((now || Date.now()) - 29 * 86400000).toISOString().slice(0, 10);
  const [modeRes, recentRes, eventRes] = await env.DB.batch([
    env.DB.prepare('SELECT mode, SUM(answered) AS n, MIN(day) AS first_day FROM usage_daily GROUP BY mode'),
    env.DB.prepare('SELECT COALESCE(SUM(answered), 0) AS n FROM usage_daily WHERE day >= ?1').bind(since30),
    env.DB.prepare('SELECT event, SUM(n) AS n FROM events_daily GROUP BY event'),
  ]);

  const events = {};
  EVENT_NAMES.forEach(function (e) { events[e] = 0; });
  ((eventRes && eventRes.results) || []).forEach(function (r) {
    if (Object.prototype.hasOwnProperty.call(events, r.event)) events[r.event] = Number(r.n) || 0;
  });

  const byMode = {};
  LOOKUP_MODE_NAMES.forEach(function (m) { byMode[m] = 0; });
  let total = 0;
  let since = null;
  (modeRes.results || []).forEach(function (r) {
    const n = Number(r.n) || 0;
    if (Object.prototype.hasOwnProperty.call(byMode, r.mode)) byMode[r.mode] = n;
    total += n;
    if (r.first_day && (!since || r.first_day < since)) since = r.first_day;
  });
  const recent = (recentRes.results && recentRes.results[0]) || {};
  return { total: total, last30Days: Number(recent.n) || 0, byMode: byMode, since: since, events: events };
}
