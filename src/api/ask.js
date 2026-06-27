// Cloudflare Worker route — server-side proxy to DeepSeek.
// The API key lives in env.DEEPSEEK_API_KEY (secret) and never reaches the browser.
// This endpoint is hardened against the obvious abuse vectors: it locks the model,
// caps token usage, limits input size, and soft-checks the request origin.

const MODEL          = 'deepseek-chat';   // forced — client cannot pick a pricier model
const MAX_TOKENS_CAP = 2000;              // hard ceiling regardless of what the client asks
const MAX_MESSAGES   = 4;                 // system + a couple user turns is all we need
const MAX_TOTAL_CHARS = 12000;            // total characters across all message content

import { originAllowed } from '../_shared.js';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Anything that isn't POST gets a clean 405 instead of falling through to static serving.
export function onRequestGet() {
  return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!originAllowed(request.headers.get('Origin'))) {
    return json({ error: 'Forbidden.' }, 403);
  }

  const key = env.DEEPSEEK_API_KEY;
  if (!key) {
    return json({ error: 'API key not configured.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: 'Invalid request body.' }, 400);
  }

  // ── Validate the message payload ──────────────────────────────────────
  const messages = body && body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return json({ error: 'Invalid request.' }, 400);
  }

  let totalChars = 0;
  for (const m of messages) {
    if (!m || typeof m.content !== 'string' || (m.role !== 'system' && m.role !== 'user')) {
      return json({ error: 'Invalid request.' }, 400);
    }
    totalChars += m.content.length;
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return json({ error: 'Request too large.' }, 413);
  }

  // ── Build a sanitized upstream request (ignore client-supplied model etc.) ──
  let maxTokens = parseInt(body.max_tokens, 10);
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) maxTokens = 700;
  maxTokens = Math.min(maxTokens, MAX_TOKENS_CAP);

  let temperature = Number(body.temperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) temperature = 0.3;

  const payload = {
    model: MODEL,
    messages: messages,
    temperature: temperature,
    max_tokens: maxTokens,
  };

  // ── Call DeepSeek ─────────────────────────────────────────────────────
  let upstream;
  try {
    upstream = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (_) {
    return json({ error: 'Upstream request failed.' }, 502);
  }

  const text = await upstream.text();
  // Pass the upstream status + body straight through, but guarantee JSON content-type.
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
