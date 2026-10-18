// POST /api/paypal-webhook — keeps unlock codes in step with PayPal.
// Verifies each event with PayPal's server-side signature API, then:
//   PAYMENT.CAPTURE.COMPLETED                    → activate a pending code, or mint one
//                                                  if /api/capture never got to (backstop)
//   PAYMENT.CAPTURE.DENIED / REVERSED / REFUNDED → revoke the code's credits
// An event is recorded as processed only AFTER it succeeds, so a failure is
// retried by PayPal instead of being silently skipped.
// PII-FREE: only the opaque event id, capture id and coarse day are stored.
import { json, today, newUnlockCode, paypalBase } from '../_shared.js';
import { tierById, TIER_CURRENCY } from '../_credits.js';

const REVOKE_EVENTS = ['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.REVERSED', 'PAYMENT.CAPTURE.REFUNDED'];

async function getAccessToken(env) {
  const base = paypalBase(env);
  const creds = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('auth');
  const j = await res.json();
  return j.access_token;
}

async function verifyWebhook(env, request, rawBody) {
  const base = paypalBase(env);
  let token;
  try { token = await getAccessToken(env); } catch (_) { return false; }
  const verify = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transmission_id:   request.headers.get('paypal-transmission-id') || '',
      transmission_time: request.headers.get('paypal-transmission-time') || '',
      cert_url:          request.headers.get('paypal-cert-url') || '',
      auth_algo:         request.headers.get('paypal-auth-algo') || '',
      transmission_sig:  request.headers.get('paypal-transmission-sig') || '',
      webhook_id:        env.PAYPAL_WEBHOOK_ID || '',
      webhook_event:     JSON.parse(rawBody),
    }),
  }).catch(() => null);
  if (!verify || !verify.ok) return false;
  const result = await verify.json().catch(() => ({}));
  return result.verification_status === 'SUCCESS';
}

// Capture events carry the capture as `resource`; refund events carry the refund
// and link back to the capture with rel="up".
export function captureIdOf(event) {
  const r = (event && event.resource) || {};
  if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
    const up = (r.links || []).find((l) => l && l.rel === 'up' && /\/captures\/([A-Z0-9]+)/.test(l.href || ''));
    return up ? up.href.match(/\/captures\/([A-Z0-9]+)/)[1] : '';
  }
  return String(r.id || '');
}

// Pure decision for an event, given whether a code already exists for the capture.
export function planWebhook(event, existing) {
  const type = String(event.event_type || '');
  if (REVOKE_EVENTS.indexOf(type) !== -1) return existing ? { action: 'revoke' } : { action: 'none' };
  if (type !== 'PAYMENT.CAPTURE.COMPLETED') return { action: 'none' };
  if (existing) return existing.status === 'pending' ? { action: 'activate' } : { action: 'none' };
  const r = event.resource || {};
  const tier = tierById(r.custom_id || '');
  if (!tier) return { action: 'none' };
  if (!r.amount || r.amount.value !== tier.price || r.amount.currency_code !== TIER_CURRENCY) return { action: 'none', reason: 'amount_mismatch' };
  return { action: 'mint', tier: tier };
}

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const rawBody = await request.text().catch(() => '');
  if (!rawBody) return new Response('', { status: 200 });

  const valid = await verifyWebhook(env, request, rawBody).catch(() => false);
  if (!valid) return new Response('', { status: 400 }); // PayPal retries; never 200 a bad signature

  let event;
  try { event = JSON.parse(rawBody); } catch (_) { return new Response('', { status: 200 }); }
  const eventId = String(event.id || '').slice(0, 64);

  try {
    if (eventId) {
      const seen = await env.DB.prepare('SELECT 1 FROM webhook_events WHERE event_id = ?').bind(eventId).first();
      if (seen) return new Response('', { status: 200 }); // replay
    }

    const captureId = captureIdOf(event);
    if (captureId) {
      const existing = await env.DB.prepare('SELECT code, status FROM licenses WHERE order_ref = ?').bind(captureId).first();
      const plan = planWebhook(event, existing);
      if (plan.action === 'activate') {
        await env.DB.prepare("UPDATE licenses SET status = 'active' WHERE order_ref = ? AND status = 'pending'").bind(captureId).run();
      } else if (plan.action === 'revoke') {
        await env.DB.prepare("UPDATE licenses SET status = 'revoked' WHERE order_ref = ?").bind(captureId).run();
      } else if (plan.action === 'mint') {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO licenses (code, credits_total, credits_used, search_total, search_used, gen_total, gen_used, order_ref, created_day, status) VALUES (?, 0, 0, ?, 0, ?, 0, ?, ?, 'active')"
        ).bind(newUnlockCode(), plan.tier.search, plan.tier.gen, captureId, today()).run();
      } else if (plan.reason) {
        console.error('paypal-webhook: not minting', plan.reason, 'capture', captureId);
      }
    }

    if (eventId) {
      await env.DB.prepare('INSERT OR IGNORE INTO webhook_events (event_id, created_day) VALUES (?, ?)').bind(eventId, today()).run();
    }
  } catch (_) {
    return new Response('', { status: 500 }); // not recorded → PayPal retries
  }
  return new Response('', { status: 200 });
}
