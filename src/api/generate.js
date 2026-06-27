// POST /api/generate — premium artifact orchestrator.
// Strict order: originAllowed → rateLimit → validate → credit gate (free then paid)
// → author (AI) → template → render (Browser Rendering) → deliver + refund on throw.
import { originAllowed, json, sendEmail, normalizeCode } from '../_shared.js';
import { rateLimit, dailyAllowance, refundDaily } from '../_rate.js';
import { consumeGenerationCredit, refundGenerationCredit, FREE_GEN_PER_DAY } from '../_credits.js';
import {
  buildInfographic, validateInfographic,
  buildDossier, validateDossier,
  buildScenario, validateScenario,
  buildCertificate, validateCertificate, verifyQuizPass,
  buildPhrasebook, validatePhrasebook,
} from '../_premium.js';
import {
  infographicHtml, dossierHtml, scenarioHtml, certificateHtml, phrasebookHtml,
} from '../_templates.js';
import { htmlToPng, htmlToPdf, toBase64 } from '../_render.js';

const VALID_KINDS = ['infographic', 'dossier', 'scenario', 'certificate', 'phrasebook'];

// Per-kind delivery config.
const KIND_CONFIG = {
  infographic: { format: 'png', filename: 'isitpolite-infographic.png', mime: 'image/png' },
  dossier:     { format: 'pdf', filename: 'isitpolite-dossier.pdf',     mime: 'application/pdf' },
  scenario:    { format: 'png', filename: 'isitpolite-coaching.png',    mime: 'image/png' },
  certificate: { format: 'png', filename: 'isitpolite-certificate.png', mime: 'image/png' },
  phrasebook:  { format: 'pdf', filename: 'isitpolite-phrasebook.pdf',  mime: 'application/pdf' },
};

// Minimal PII screen on Scenario text (server-side mirror of client piiMessage).
function containsPii(text) {
  if (!text) return false;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) return true;
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) return true;
  const cc = text.match(/\b(?:\d[ -]?){13,19}\b/);
  if (cc) {
    const d = cc[0].replace(/\D/g, '');
    if (d.length >= 13 && d.length <= 19) return true;
  }
  return false;
}

export function onRequestGet() {
  return json({ error: 'Method not allowed.' }, 405);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') || '';

  // ── 1. Origin guard ───────────────────────────────────────────────────────
  if (!originAllowed(request.headers.get('Origin'))) return json({ error: 'Forbidden.' }, 403);

  // ── 2. Rate limit (3 generate calls / 60s per IP) ─────────────────────────
  if (!(await rateLimit(env, ip, 'generate', 3, 60000))) {
    return json({ error: 'Too many requests. Please wait a moment.' }, 429);
  }

  // ── 3. Parse + validate request ───────────────────────────────────────────
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }

  const kind = String(body.kind || '');
  if (!VALID_KINDS.includes(kind)) return json({ error: 'Invalid artifact kind.' }, 400);

  // Optional paid-credit code — normalizeCode returns null if absent/malformed.
  const code = normalizeCode(body.unlock || '');

  const delivery = body.delivery === 'email' ? 'email' : 'download';
  const email = delivery === 'email' ? String(body.email || '').trim().slice(0, 200) : null;
  if (delivery === 'email' && !email) return json({ error: 'Email address required for email delivery.' }, 400);

  // Per-kind param slicing.
  const params = {
    kind,
    subkind:        String(body.subkind        || '').slice(0, 20),
    country:        String(body.country        || '').slice(0, 80),
    gesture:        String(body.gesture        || '').slice(0, 200),
    fromCountry:    String(body.from           || '').slice(0, 80),
    toCountry:      String(body.to             || '').slice(0, 80),
    scenario:       String(body.scenario       || '').slice(0, 600),
    recipientName:  String(body.recipientName  || '').slice(0, 60),
    score:          parseInt(body.score)       || 0,
    totalQuestions: parseInt(body.totalQuestions) || 5,
    answers:        Array.isArray(body.answers)   ? body.answers.slice(0, 10) : [],
    questions:      Array.isArray(body.questions) ? body.questions.slice(0, 10) : [],
    result:         body.result || null,  // pre-computed free-lookup JSON (reused, not re-fetched)
  };

  // ── 4. Pre-charge validation gates ────────────────────────────────────────
  // Scenario PII guard (server-side).
  if (kind === 'scenario' && containsPii(params.scenario)) {
    return json({ error: 'Please remove personal information from your scenario before submitting.' }, 400);
  }

  // Certificate server-side pass gate.
  if (kind === 'certificate' && !verifyQuizPass(params.answers, params.questions)) {
    return json({ error: 'A passing score (4/5) is required for the certificate.' }, 403);
  }

  // ── 5. Credit gate ─────────────────────────────────────────────────────────
  // Free daily allowance first (1/day for all 5 artifact kinds combined),
  // then fall back to the paid generation pool. Fails OPEN for free, CLOSED for paid.
  var charged;  // { kind: 'free' } | { kind: 'paid', code, remaining }

  const free = await dailyAllowance(env, ip, 'free_gen', FREE_GEN_PER_DAY);
  if (free.allowed) {
    charged = { kind: 'free' };
  } else if (code) {
    const paid = await consumeGenerationCredit(env, code);
    if (!paid.ok) {
      // Identical response whether the code is invalid, depleted, or hit a
      // transient error — so a code's existence can't be probed (no oracle).
      return json({
        error: 'This unlock code has no credits left, or is not valid. Add a pack to make more.',
        reason: 'no_credits', upsell: true,
      }, 402);
    }
    charged = { kind: 'paid', code: code, remaining: paid.remaining };
  } else {
    // Free exhausted, no code supplied.
    return json({
      error: 'You have used your ' + FREE_GEN_PER_DAY + ' free creation for today. It resets at midnight Pacific time. Add a pack to make more.',
      reason: 'daily_exhausted',
      upsell: true,
    }, 402);
  }

  // Past this point a credit has been reserved.
  // Any throw inside the try block MUST refund before returning.
  let bytes;
  try {
    // ── 6. Author content via AI ───────────────────────────────────────────
    let data;
    switch (kind) {
      case 'infographic': data = await buildInfographic(env, params); break;
      case 'dossier':     data = await buildDossier(env, params);     break;
      case 'scenario':    data = await buildScenario(env, params);    break;
      case 'certificate': data = await buildCertificate(env, params); break;
      case 'phrasebook':  data = await buildPhrasebook(env, params);  break;
    }

    // ── 7. Build the HTML template ─────────────────────────────────────────
    let html;
    switch (kind) {
      case 'infographic': html = infographicHtml(data, params); break;
      case 'dossier':     html = dossierHtml(data);             break;
      case 'scenario':    html = scenarioHtml(data, params);    break;
      case 'certificate': html = certificateHtml(data);         break;
      case 'phrasebook':  html = phrasebookHtml(data);          break;
    }

    // ── 8. Rasterize via Browser Rendering ────────────────────────────────
    const cfg = KIND_CONFIG[kind];
    bytes = cfg.format === 'pdf'
      ? await htmlToPdf(env, html)
      : await htmlToPng(env, html);

  } catch (err) {
    // Render/author failed — refund whichever pool was charged.
    if (charged.kind === 'free') {
      await refundDaily(env, ip, 'free_gen');
    } else {
      await refundGenerationCredit(env, charged.code);
    }
    console.error('generate error', kind, (err && err.message) || String(err));
    return json({ error: 'Generation failed. Your credit has been refunded. Please try again.' }, 500);
  }

  const cfg = KIND_CONFIG[kind];

  // ── 9. Deliver ─────────────────────────────────────────────────────────────
  // X-Credits-Remaining: paid remaining when paid; free remaining when free.
  const creditsHeader = charged.kind === 'paid'
    ? String(charged.remaining)
    : String(free.remaining);

  if (delivery === 'email') {
    const b64 = toBase64(bytes);
    const creditsLine = charged.kind === 'paid'
      ? `Credits remaining: ${charged.remaining}`
      : 'Free daily creation used — resets at midnight Pacific.';
    await sendEmail(env, {
      to: email,
      subject: `Your IsItPolite ${kind} is ready`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px">
        <h2 style="color:#4F46E5">Your premium artifact is attached!</h2>
        <p>Here is your <strong>${kind}</strong> from IsItPolite.com, generated just for you.</p>
        <p style="color:#6B7280;font-size:13px">${creditsLine}</p>
      </div>`,
      attachments: [{ filename: cfg.filename, content: b64 }],
    });
    return json({ ok: true, remaining: charged.kind === 'paid' ? charged.remaining : null });
  }

  // Download: return raw binary.
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': cfg.mime,
      'Content-Disposition': `attachment; filename="${cfg.filename}"`,
      'Cache-Control': 'no-store',
      'X-Credits-Remaining': creditsHeader,
    },
  });
}
