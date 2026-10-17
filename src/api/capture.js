// POST /api/capture { orderID, email? }
// Captures a PayPal order and mints a tiered unlock code.
// PII-FREE: D1 stores only code + pool counters + opaque capture id + coarse day.
// The email (if supplied) is used ONCE to send the code via Resend, then discarded.
//
// ANTI-TAMPER: the tier (and therefore the credit grant) is read back from the
// CAPTURED order's custom_id — never from the client request. A client claiming
// a richer tier at capture time gets exactly what they paid for, not what they ask.
import { originAllowed, json, today, sendEmail, newUnlockCode, paypalBase } from '../_shared.js';
import { rateLimit } from '../_rate.js';
import { tierById, TIER_CURRENCY } from '../_credits.js';

async function getAccessToken(env) {
  const base = paypalBase(env);
  const creds = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('paypal_auth');
  const j = await res.json();
  if (!j.access_token) throw new Error('paypal_no_token');
  return j.access_token;
}

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!originAllowed(request.headers.get('Origin'), request.headers.get('Sec-Fetch-Site'))) return json({ error: 'Forbidden.' }, 403);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!(await rateLimit(env, ip, 'capture', 10, 60000))) {
    return json({ error: 'Too many requests. Please wait a moment.' }, 429);
  }

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'Bad request.' }, 400);

  const orderID = String(body.orderID || '').trim().slice(0, 64);
  const email = String(body.email || '').trim().slice(0, 200) || null;
  if (!orderID) return json({ error: 'Missing orderID.' }, 400);
  // PayPal order ids are short uppercase alphanumerics. Anything else (e.g.
  // "../../payments/captures/<id>/refund#") could re-target the authenticated
  // request at another PayPal endpoint — reject it before building the URL.
  if (!/^[A-Z0-9]{10,30}$/.test(orderID)) return json({ error: 'Invalid orderID.' }, 400);

  // ── Capture the PayPal order ───────────────────────────────────────────────
  let token;
  try { token = await getAccessToken(env); }
  catch (_) { return json({ error: 'Payment service unavailable.' }, 502); }

  const base = paypalBase(env);
  let captureRes;
  try {
    captureRes = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': 'cap-' + orderID,  // idempotency key
      },
    });
  } catch (_) {
    return json({ error: 'Payment capture failed. Please try again.' }, 502);
  }

  if (!captureRes.ok) {
    return json({ error: 'Payment could not be captured. Please try again.' }, 502);
  }

  const captured = await captureRes.json();
  if (captured.status !== 'COMPLETED') {
    return json({ error: 'Payment not completed. Status: ' + (captured.status || 'unknown') }, 402);
  }

  // Extract the opaque capture id (no buyer PII in this field).
  const captureId = captured.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderID;

  // ── Read tier from the captured order (server-trusted, never from the client) ──
  const customId = captured.purchase_units?.[0]?.custom_id || '';
  const tier = tierById(customId);
  if (!tier) {
    // The order was created without a recognisable tier — don't mint.
    console.error('capture: unresolvable custom_id', customId, 'orderID', orderID);
    return json({ error: 'We could not determine your pack. Your payment was not charged for credits — please contact support.' }, 502);
  }

  // Defense-in-depth: confirm the amount actually captured matches the tier's
  // server-side price + currency. custom_id and amount are both fixed at order
  // creation, but never mint a full grant for an underpaid / mismatched order.
  const capAmt = captured.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
  if (!capAmt || capAmt.value !== tier.price || capAmt.currency_code !== TIER_CURRENCY) {
    console.error('capture: amount mismatch', 'orderID', orderID, 'tier', tier.id);
    return json({ error: 'Payment amount did not match the selected pack. Your card was not charged for credits — please contact support.' }, 502);
  }

  // ── Idempotent code mint ───────────────────────────────────────────────────
  // UNIQUE constraint on order_ref: if this capture was already processed
  // (browser refresh / double-submit), return the existing code + balances.
  let code;
  try {
    const existing = await env.DB.prepare(
      'SELECT code FROM licenses WHERE order_ref = ?'
    ).bind(captureId).first();

    if (existing && existing.code) {
      code = existing.code;
    } else {
      code = newUnlockCode();
      await env.DB.prepare(
        'INSERT OR IGNORE INTO licenses (code, credits_total, credits_used, search_total, search_used, gen_total, gen_used, order_ref, created_day) VALUES (?, 0, 0, ?, 0, ?, 0, ?, ?)'
      ).bind(code, tier.search, tier.gen, captureId, today()).run();

      // If the INSERT lost a race, read back the winner.
      const check = await env.DB.prepare('SELECT code FROM licenses WHERE order_ref = ?').bind(captureId).first();
      if (check && check.code) code = check.code;
    }
  } catch (_) {
    return json({ error: 'Could not store your unlock code. Please contact support.' }, 500);
  }

  // ── Email the code (fire-and-forget, PII discarded after send) ────────────
  if (email) {
    context.waitUntil(sendEmail(env, {
      to: email,
      subject: 'Your IsItPolite credit pack is ready',
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px">
        <h2 style="color:#4F46E5;margin:0 0 16px">Your unlock code is ready!</h2>
        <p style="margin:0 0 12px">Thank you for your purchase. Here is your <strong>${tier.label} credit pack</strong> unlock code:</p>
        <div style="font-size:26px;font-weight:700;letter-spacing:0.15em;color:#3730A3;background:#EEF2FF;border-radius:10px;padding:16px 24px;display:inline-block;margin:0 0 16px">${code}</div>
        <p style="color:#6B7280;font-size:13px;margin:0 0 8px">Enter this code on <a href="https://isitpolite.com" style="color:#4F46E5">IsItPolite.com</a> when prompted. Your pack includes <strong>${tier.search} search credits</strong> and <strong>${tier.gen} creation credits</strong>.</p>
        <p style="color:#6B7280;font-size:13px;margin:0 0 8px">Credits never expire and are used only after your free daily allowance runs out.</p>
        <p style="color:#E53E3E;font-size:13px;font-weight:600;margin:0 0 16px">Save this code — it is your only receipt. No account is needed.</p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0">
        <p style="color:#9CA3AF;font-size:11px">IsItPolite.com · Cultural intelligence for curious travelers<br>Your code is stored in your browser — save it somewhere safe.</p>
      </div>`,
    }).catch(() => {})); // email is best-effort; code is returned in the response regardless
  }

  return json({
    code,
    search:     { remaining: tier.search, total: tier.search },
    generation: { remaining: tier.gen,    total: tier.gen },
    // Legacy mirror — keeps existing frontend badge / apply-code flow working.
    remaining: tier.gen,
    total:     tier.gen,
  });
}
