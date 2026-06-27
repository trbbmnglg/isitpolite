// POST /api/checkout → { orderID }
// Creates a PayPal Orders v2 order and returns the order id so the browser
// can pass it to the PayPal JS SDK onApprove flow.
// Tier is client-selected but the price/grant are read from server-side TIERS config —
// the client can never inflate the tier beyond what it paid for.
import { originAllowed, json, paypalBase } from '../_shared.js';
import { rateLimit } from '../_rate.js';
import { TIER_CURRENCY, TIERS, tierById } from '../_credits.js';

async function getAccessToken(env) {
  const base = paypalBase(env);
  const creds = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('paypal_auth_' + res.status);
  const j = await res.json();
  if (!j.access_token) throw new Error('paypal_no_token');
  return j.access_token;
}

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!originAllowed(request.headers.get('Origin'))) return json({ error: 'Forbidden.' }, 403);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await rateLimit(env, ip, 'checkout', 10, 60000))) {
    return json({ error: 'Too many requests. Please wait a moment.' }, 429);
  }

  // ── Tier selection (allow-list — never trust client amounts) ───────────────
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }

  // Slice to 8 chars before allow-list lookup so an oversized input can't cause issues.
  const tier = tierById(String(body && body.tier || '').slice(0, 8));
  if (!tier) return json({ error: 'Invalid request.' }, 400);

  let token;
  try { token = await getAccessToken(env); }
  catch (_) { return json({ error: 'Payment service unavailable. Please try again.' }, 502); }

  const base = paypalBase(env);

  let res;
  try {
    res = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': crypto.randomUUID(),  // idempotency key
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          // Amount and description come from server config — never the client.
          amount: { currency_code: TIER_CURRENCY, value: tier.price },
          description: 'IsItPolite — ' + tier.label + ' credit pack',
          // custom_id is baked into the order so capture can read back the
          // server-trusted tier without relying on any client-supplied value.
          custom_id: tier.id,
        }],
        application_context: {
          brand_name: 'IsItPolite.com',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
        },
      }),
    });
  } catch (_) {
    return json({ error: 'Payment service unavailable. Please try again.' }, 502);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('PayPal create order error', res.status, errBody);
    return json({ error: 'Could not create payment. Please try again.' }, 502);
  }

  const order = await res.json();
  if (!order.id) return json({ error: 'Payment order missing ID.' }, 502);

  return json({ orderID: order.id });
}
