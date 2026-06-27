// POST /api/paypal-webhook — backstop / reconciliation listener.
// Verifies the event with PayPal's server-side signature API, then
// idempotently mints a tiered license if the capture path somehow missed it.
// PII-FREE: only stores the opaque event id + capture id + coarse day.
//
// NOTE: the capture endpoint is primary — the webhook only runs if capture failed.
// The tier is derived from the event's custom_id (set at order creation) so no
// client value is ever trusted.
import { json, today, sendEmail, newUnlockCode, paypalBase } from '../_shared.js';
import { tierById } from '../_credits.js';

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
  // PayPal uses a server-side verification API instead of a shared HMAC secret.
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

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Read raw body BEFORE json() — needed for signature verification.
  const rawBody = await request.text().catch(() => '');
  if (!rawBody) return new Response('', { status: 200 }); // ack empty body

  // Verify signature.
  const valid = await verifyWebhook(env, request, rawBody).catch(() => false);
  if (!valid) {
    return new Response('', { status: 400 }); // tell PayPal to retry (don't 200 bad sigs)
  }

  let event;
  try { event = JSON.parse(rawBody); } catch (_) { return new Response('', { status: 200 }); }

  const eventId   = String(event.id   || '').slice(0, 64);
  const eventType = String(event.event_type || '');

  if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
    return new Response('', { status: 200 }); // not interested, ack and move on
  }

  // Idempotency check on event_id.
  try {
    const alreadyProcessed = await env.DB.prepare(
      'SELECT 1 FROM webhook_events WHERE event_id = ?'
    ).bind(eventId).first();
    if (alreadyProcessed) return new Response('', { status: 200 }); // replay — already handled

    await env.DB.prepare(
      'INSERT OR IGNORE INTO webhook_events (event_id, created_day) VALUES (?, ?)'
    ).bind(eventId, today()).run();
  } catch (_) {
    return new Response('', { status: 500 });
  }

  // Extract capture id (opaque, no buyer PII).
  const captureId = event.resource?.id || '';
  if (!captureId) return new Response('', { status: 200 });

  // Read tier from the captured event's custom_id.
  // If absent/unrecognisable, ack without minting — the capture endpoint already
  // handled it or the event is from a pre-tier order.
  const customId = event.resource?.custom_id || '';
  const tier = tierById(customId);

  // Idempotent mint — only if the capture endpoint didn't already create it.
  try {
    const existing = await env.DB.prepare(
      'SELECT code FROM licenses WHERE order_ref = ?'
    ).bind(captureId).first();

    if (!existing) {
      if (tier) {
        // New tiered mint.
        const code = newUnlockCode();
        await env.DB.prepare(
          'INSERT OR IGNORE INTO licenses (code, credits_total, credits_used, search_total, search_used, gen_total, gen_used, order_ref, created_day) VALUES (?, 0, 0, ?, 0, ?, 0, ?, ?)'
        ).bind(code, tier.search, tier.gen, captureId, today()).run();
      }
      // If tier is null (legacy pre-tier order), ack without minting.
      // The capture endpoint is primary; the webhook is a backstop only.
    }
    // If it already exists, nothing to do — code was minted by /api/capture.
  } catch (_) {
    return new Response('', { status: 500 });
  }

  return new Response('', { status: 200 });
}
