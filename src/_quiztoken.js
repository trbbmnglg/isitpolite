// Signed quiz tokens — let /api/generate trust a certificate's country and score.
// When /api/lookup builds a quiz it signs {country, answer key, expiry} with
// QUIZ_SECRET (HMAC-SHA256). The certificate request sends back the token plus
// the visitor's picks; the server re-scores against the signed key, so a client
// can't invent questions, a country or a score. Nothing about the visitor is in it.
const TTL_MS = 24 * 60 * 60 * 1000;
const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Returns '' when no secret is configured (certificates are then refused).
export async function signQuiz(env, country, questions, now) {
  if (!env || !env.QUIZ_SECRET || !Array.isArray(questions) || !questions.length) return '';
  const key = questions.map(function (q) { return (q && Number.isInteger(q.correct)) ? q.correct : -1; });
  const body = b64url(enc.encode(JSON.stringify({ c: country, k: key, e: (now || Date.now()) + TTL_MS })));
  return body + '.' + b64url(await hmac(env.QUIZ_SECRET, body));
}

// → { country, score, total } for a valid, unexpired token, else null.
export async function scoreQuiz(env, token, answers, now) {
  if (!env || !env.QUIZ_SECRET || typeof token !== 'string' || !Array.isArray(answers)) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || parts[0].length > 2000) return null;
  let payload;
  try {
    if (!sameBytes(fromB64url(parts[1]), await hmac(env.QUIZ_SECRET, parts[0]))) return null;
    payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
  } catch (_) { return null; }
  if (!payload || !Array.isArray(payload.k) || typeof payload.c !== 'string') return null;
  if (!(payload.e > (now || Date.now()))) return null;
  if (answers.length !== payload.k.length) return null;
  let score = 0;
  for (let i = 0; i < payload.k.length; i++) if (payload.k[i] >= 0 && answers[i] === payload.k[i]) score++;
  return { country: payload.c, score: score, total: payload.k.length };
}

// 4 of 5 — scaled for the rare shorter quiz.
export function quizPassed(result) {
  return !!result && result.total > 0 && result.score >= Math.ceil(result.total * 0.8);
}
