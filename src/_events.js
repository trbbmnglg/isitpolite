// Privacy-safe product event counter (shares, saved briefings, installs, ...).
// PII-FREE BY DESIGN: a row is only (UTC day, event name, count) — no IP or
// hash of it, no user agent, no content of what was shared or saved.
import { today, EVENT_NAMES } from './_shared.js';
import { PROD_HOST } from './_usage.js';

export function shouldCountEvent(requestUrl, event) {
  let host;
  try { host = new URL(requestUrl).hostname; } catch (_) { return false; }
  return host === PROD_HOST && EVENT_NAMES.indexOf(event) !== -1;
}

export async function incrementEvent(env, event, day) {
  await env.DB.prepare(
    'INSERT INTO events_daily (day, event, n) VALUES (?1, ?2, 1) ' +
    'ON CONFLICT(day, event) DO UPDATE SET n = n + 1'
  ).bind(day || today(), event).run();
}

// Never throws and never delays the response: the write runs in waitUntil.
export function recordEvent(context, event) {
  try {
    if (!shouldCountEvent(context.request.url, event)) return false;
    context.waitUntil(incrementEvent(context.env, event).catch(function (e) {
      console.error('event_count_failed', (e && e.message) || String(e));
    }));
    return true;
  } catch (e) {
    console.error('event_count_failed', (e && e.message) || String(e));
    return false;
  }
}
