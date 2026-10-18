// IsItPolite.com — Cloudflare Worker entry point.
// Routes /api/* to the appropriate handler; everything else is served from
// the Static Assets binding (the pre-built ./dist folder).

import * as lookup     from './api/lookup.js';
import * as accuracy   from './api/accuracy.js';
import * as community  from './api/community.js';
import * as feedback   from './api/feedback.js';
import * as report     from './api/report.js';
import * as stats      from './api/stats.js';
import * as event      from './api/event.js';
import * as contrast   from './api/contrast.js';
// Premium routes (Phase 1)
import * as paypalConfig  from './api/paypal-config.js';
import * as checkout      from './api/checkout.js';
import * as capture       from './api/capture.js';
import * as paypalWebhook from './api/paypal-webhook.js';
import * as credits       from './api/credits.js';
import * as generate      from './api/generate.js';

const ROUTES = {
  '/api/lookup':          lookup,
  '/api/accuracy':        accuracy,
  '/api/community':       community,
  '/api/feedback':        feedback,
  '/api/report':          report,
  '/api/stats':           stats,
  '/api/event':           event,
  '/api/contrast':        contrast,
  // Premium
  '/api/paypal-config':   paypalConfig,
  '/api/checkout':        checkout,
  '/api/capture':         capture,
  '/api/paypal-webhook':  paypalWebhook,
  '/api/credits':         credits,
  '/api/generate':        generate,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Canonical-host redirect: *.workers.dev → isitpolite.com.
    // Skipped for the web-rbbjr subdomain, which is used as a staging URL.
    // (Replaces the old functions/_middleware.js Pages middleware.)
    if (url.hostname.endsWith('.workers.dev') && !url.hostname.startsWith('isitpolite.web-rbbjr')) {
      url.hostname = 'isitpolite.com';
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    // Route API requests to their handlers.
    const mod = ROUTES[url.pathname];
    if (mod) {
      // Only GET/HEAD reach onRequestGet and only POST reaches onRequestPost —
      // OPTIONS/PUT/DELETE etc. never run a real handler.
      const m = request.method;
      const handler = m === 'POST' ? mod.onRequestPost
        : (m === 'GET' || m === 'HEAD') ? mod.onRequestGet
        : null;
      if (!handler) {
        const allow = [];
        if (mod.onRequestGet) allow.push('GET', 'HEAD');
        if (mod.onRequestPost) allow.push('POST');
        return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', 'Allow': allow.join(', ') },
        });
      }
      return handler({ request, env, ctx, waitUntil: ctx.waitUntil.bind(ctx) });
    }

    // Everything else: serve from the pre-built static asset bundle (./dist).
    const res = await env.ASSETS.fetch(request);
    return permanentRedirect(request, url, res);
  },
};

// Static assets answer /page (no slash) and /index.html with a temporary 307.
// Search engines treat that as "keep both URLs", so make same-site ones 301.
export function permanentRedirect(request, url, res) {
  if (res.status !== 307 || (request.method !== 'GET' && request.method !== 'HEAD')) return res;
  const loc = res.headers.get('Location');
  if (!loc) return res;
  const target = new URL(loc, url);
  if (target.origin !== url.origin) return res;
  return new Response(null, { status: 301, headers: { Location: target.toString(), 'Cache-Control': 'public, max-age=3600' } });
}
