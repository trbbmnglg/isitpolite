// Shared helpers for the community API Functions. Files prefixed with "_" are
// NOT routes — they're importable modules.

const ALLOWED_HOSTS = ['isitpolite.com', 'www.isitpolite.com', 'isitpolite.pages.dev'];

// Owner notification address (server-side only — not exposed to the browser).
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

// Send an email via Resend. Key lives in env.RESEND_API_KEY (secret).
export async function sendEmail(env, opts) {
  if (!env.RESEND_API_KEY) return { skipped: true };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: opts.from || 'IsItPolite <onboarding@resend.dev>',
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch (_) {
    return { ok: false };
  }
}

export function accuracyOf(confirm, dispute) {
  const total = confirm + dispute;
  if (total < 3) return { pct: null, total: total, status: 'insufficient' };
  return { pct: Math.round((confirm / total) * 100), total: total, status: 'rated' };
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// Fixed-window rate limit, PII-free. Stores only name:SHA256(ip+secret_salt):window
// — an irreversible, salted token (NEVER the IP). Buckets auto-purge within minutes.
// Returns true if allowed, false if the limit is exceeded.
export async function rateLimit(env, ip, name, limit, windowMs) {
  try {
    // Random server-side salt (generated once, stored in D1; never the IP).
    let salt;
    const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'rl_salt'").first();
    if (row && row.v) {
      salt = row.v;
    } else {
      salt = crypto.randomUUID() + crypto.randomUUID();
      await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('rl_salt', ?)").bind(salt).run();
      const r2 = await env.DB.prepare("SELECT v FROM meta WHERE k = 'rl_salt'").first();
      if (r2 && r2.v) salt = r2.v;
    }

    const now = Date.now();
    const win = Math.floor(now / windowMs);
    const token = await sha256hex((ip || 'unknown') + '|' + salt);
    const bucket = name + ':' + token + ':' + win;

    const cur = await env.DB.prepare('SELECT count FROM rate WHERE bucket = ?').bind(bucket).first();
    if (cur && cur.count >= limit) return false;

    await env.DB.prepare(
      'INSERT INTO rate (bucket, count, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1'
    ).bind(bucket, now).run();

    // Opportunistic cleanup of expired buckets.
    if (Math.random() < 0.08) {
      try { await env.DB.prepare('DELETE FROM rate WHERE window_start < ?').bind(now - windowMs * 3).run(); } catch (_) {}
    }
    return true;
  } catch (_) {
    return true; // fail open — never block a genuine user if the limiter errors
  }
}

// Server-side AI call (build-time secret env.DEEPSEEK_API_KEY). Returns parsed JSON.
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
