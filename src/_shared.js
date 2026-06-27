// Core utilities shared across all API Worker routes.
// Rate-limiting lives in _rate.js; credit/tier config lives in _credits.js.

const ALLOWED_HOSTS = ['isitpolite.com', 'www.isitpolite.com', 'isitpolite.pages.dev', 'isitpolite.web-rbbjr.workers.dev'];

export const OWNER_EMAIL = 'owner@example.invalid';

export function originAllowed(origin) {
  if (!origin) return true; // same-origin / server-side requests omit Origin
  try {
    const host = new URL(origin).hostname;
    return ALLOWED_HOSTS.includes(host) || host.endsWith('.isitpolite.pages.dev');
  } catch (_) { return false; }
}

export function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function vkeyOf(gesture, country, context) {
  return [
    String(gesture || '').toLowerCase().trim().replace(/\s+/g, ' '),
    String(country || '').trim(),
    String(context || 'general').trim(),
  ].join('|');
}

export function today() { return new Date().toISOString().slice(0, 10); }

export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Send an email via Resend. Supports optional attachments: [{ filename, content (base64) }].
export async function sendEmail(env, opts) {
  if (!env.RESEND_API_KEY) return { skipped: true };
  try {
    const body = {
      from: opts.from || 'IsItPolite <onboarding@resend.dev>',
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.attachments && opts.attachments.length) body.attachments = opts.attachments;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status };
  } catch (_) { return { ok: false }; }
}

export function accuracyOf(confirm, dispute) {
  const total = confirm + dispute;
  if (total < 3) return { pct: null, total: total, status: 'insufficient' };
  return { pct: Math.round((confirm / total) * 100), total: total, status: 'rated' };
}

// Server-side AI call. The provider name is never surfaced in user-facing output.
export async function callAI(env, messages, maxTokens) {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.2, max_tokens: maxTokens || 400 }),
  });
  if (!res.ok) throw new Error('ai_status_' + res.status);
  const j = await res.json();
  let raw = (j.choices && j.choices[0] && j.choices[0].message.content) || '';
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/g, '').trim();
  return JSON.parse(raw);
}

export function paypalBase(env) {
  return (env && env.PAYPAL_ENV === 'live')
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newUnlockCode() {
  const raw = new Uint8Array(16);
  crypto.getRandomValues(raw);
  let chars = '';
  for (let i = 0; i < 16; i++) chars += CROCKFORD[raw[i] % 32];
  return chars.slice(0, 4) + '-' + chars.slice(4, 8) + '-' + chars.slice(8, 12) + '-' + chars.slice(12, 16);
}

export function normalizeCode(s) {
  const upper = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (upper.length !== 16) return null;
  return upper.slice(0, 4) + '-' + upper.slice(4, 8) + '-' + upper.slice(8, 12) + '-' + upper.slice(12, 16);
}
