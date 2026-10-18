// Rate-limiting and Pacific-calendar daily allowance helpers.
// All helpers are PII-free — only irreversible salted tokens are stored.

export async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// Returns the current America/Los_Angeles calendar date as "YYYY-MM-DD".
// Centralised here so no other file ever does inline Intl calls or offset math.
export function pacificDay(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now || new Date());
}

// Returns the epoch-ms of the next midnight America/Los_Angeles.
export function nextPacificMidnight() {
  const now = Date.now();
  for (var ms = now + 60000; ms < now + 108000000; ms += 60000) {
    if (pacificDay(ms) !== pacificDay(now)) return ms;
  }
  return now + 86400000; // fallback
}

function dailyBucketKey(name, day, token) {
  return name + ':' + day + ':' + token;
}

// The salt lives in a Worker secret (RL_SALT), not in the same database as the
// hashed tokens. The D1 fallback only exists for local development.
export async function getRlSalt(env) {
  if (env.RL_SALT) return env.RL_SALT;
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k = 'rl_salt'").first();
  if (row && row.v) return row.v;
  const salt = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('rl_salt', ?)").bind(salt).run();
  const r2 = await env.DB.prepare("SELECT v FROM meta WHERE k = 'rl_salt'").first();
  return (r2 && r2.v) ? r2.v : salt;
}

// Fixed-window rate limit, PII-free. Buckets auto-purge within minutes.
// Returns true if allowed, false if the limit is exceeded. FAILS OPEN.
export async function rateLimit(env, ip, name, limit, windowMs) {
  try {
    const salt = await getRlSalt(env);
    const now = Date.now();
    const win = Math.floor(now / windowMs);
    const token = await sha256hex((ip || 'unknown') + '|' + salt);
    const bucket = name + ':' + token + ':' + win;

    // One atomic statement: increment and read back, so concurrent requests
    // can't all pass a separate read-then-write check.
    const row = await env.DB.prepare(
      'INSERT INTO rate (bucket, count, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count'
    ).bind(bucket, now).first();
    if (row && row.count > limit) return false;

    // Opportunistic cleanup — scoped to this name so 24h daily buckets are never
    // wiped by a 60s-window burst cleanup (B1 fix).
    if (Math.random() < 0.08) {
      try {
        await env.DB.prepare('DELETE FROM rate WHERE bucket LIKE ? AND window_start < ?')
          .bind(name + ':%', now - windowMs * 3).run();
      } catch (_) {}
    }
    return true;
  } catch (_) {
    return true; // fail open
  }
}

// Increment the free daily counter and return { allowed, remaining }. FAILS OPEN.
export async function dailyAllowance(env, ip, name, limit) {
  try {
    const salt = await getRlSalt(env);
    const token = await sha256hex((ip || 'unknown') + '|' + salt);
    const day   = pacificDay();
    const bucket = dailyBucketKey(name, day, token);
    const now   = Date.now();

    // Atomic increment-and-read (see rateLimit). Over the limit → undo our
    // increment so the stored count stays meaningful, and refuse.
    const row = await env.DB.prepare(
      'INSERT INTO rate (bucket, count, window_start) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count'
    ).bind(bucket, now).first();
    const count = (row && row.count) ? row.count - 1 : 0;
    if (count >= limit) {
      await env.DB.prepare('UPDATE rate SET count = count - 1 WHERE bucket = ? AND count > 0').bind(bucket).run();
      return { allowed: false, remaining: 0 };
    }

    if (Math.random() < 0.08) {
      try {
        await env.DB.prepare('DELETE FROM rate WHERE bucket LIKE ? AND window_start < ?')
          .bind(name + ':%', now - 3 * 86400000).run();
      } catch (_) {}
    }
    return { allowed: true, remaining: limit - count - 1 };
  } catch (_) {
    return { allowed: true, remaining: limit }; // fail open
  }
}

// Read-only — returns remaining free uses today without incrementing.
export async function dailyRemaining(env, ip, name, limit) {
  try {
    const salt = await getRlSalt(env);
    const token = await sha256hex((ip || 'unknown') + '|' + salt);
    const bucket = dailyBucketKey(name, pacificDay(), token);
    const cur = await env.DB.prepare('SELECT count FROM rate WHERE bucket = ?').bind(bucket).first();
    return Math.max(0, limit - ((cur && cur.count) ? cur.count : 0));
  } catch (_) {
    return limit; // fail open
  }
}

// Refund one free daily credit after a confirmed failure.
export async function refundDaily(env, ip, name) {
  try {
    const salt = await getRlSalt(env);
    const token = await sha256hex((ip || 'unknown') + '|' + salt);
    const bucket = dailyBucketKey(name, pacificDay(), token);
    await env.DB.prepare(
      'UPDATE rate SET count = count - 1 WHERE bucket = ? AND count > 0'
    ).bind(bucket).run();
  } catch (_) {}
}
