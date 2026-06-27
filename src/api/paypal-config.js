// GET /api/paypal-config → { clientId, currency, tiers }
// Public and cacheable — lets the front-end load the PayPal JS SDK without
// hardcoding ids in source. sandbox/live is controlled by PAYPAL_ENV secret.
//
// Currency comes from the server-side TIER_CURRENCY constant (single source of
// truth) so the SDK mount and the checkout order always use the same currency.
import { TIER_CURRENCY, TIERS } from '../_credits.js';

export function onRequestPost() {
  return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  });
}

export function onRequestGet(context) {
  const { env } = context;
  const clientId = env.PAYPAL_CLIENT_ID || '';

  // Expose tier metadata so the frontend can render tier cards from server config
  // without hardcoding prices, labels, or credit grants in the HTML/JS.
  var tierList = Object.values(TIERS).map(function (t) {
    return { id: t.id, price: t.price, search: t.search, gen: t.gen, label: t.label };
  });

  return new Response(JSON.stringify({ clientId, currency: TIER_CURRENCY, tiers: tierList }), {
    headers: {
      'Content-Type': 'application/json',
      // Cache briefly — allows browsers to reuse without an extra round-trip,
      // but short enough that sandbox/live or currency switches take effect quickly.
      'Cache-Control': 'public, max-age=300',
    },
  });
}
