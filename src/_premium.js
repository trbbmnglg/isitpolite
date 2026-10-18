// Premium content authoring via OpenAI GPT-4o / gpt-4o-mini.
// Free lookups continue to use DeepSeek (via _agent.js) — this module is
// ONLY invoked after a credit has been reserved by generate.js.
// The AI provider is never named in user-facing output.
import { ChatOpenAI } from '@langchain/openai';

// ── OpenAI via Cloudflare AI Gateway (/compat universal endpoint) ────────────
// Routes through CF AI Gateway for observability + PH-region compatibility.
// Gateway requires cf-aig-authorization header (stored as CF_AIG_TOKEN secret).
const CF_GATEWAY_BASE = 'https://gateway.ai.cloudflare.com/v1/7f817fd99a51e8d8de80bab50f356220/isitpolite/openai';

export function getOpenAI(env, maxTokens, model) {
  return new ChatOpenAI({
    model: model || 'gpt-4o-mini',
    apiKey: env.OPENAI_API_KEY,
    temperature: 0.3,
    maxTokens: maxTokens || 1200,
    configuration: {
      baseURL: CF_GATEWAY_BASE,
      defaultHeaders: {
        'cf-aig-authorization': `Bearer ${env.CF_AIG_TOKEN}`,
      },
    },
  });
}

async function jsonLLM(model, system, human) {
  const res = await model.invoke([
    { role: 'system', content: system },
    { role: 'user', content: human },
  ]);
  let raw = res && res.content;
  if (Array.isArray(raw)) raw = raw.map(function (p) { return typeof p === 'string' ? p : (p.text || ''); }).join('');
  raw = String(raw || '').replace(/```json\s*/i, '').replace(/```/g, '').trim();
  return JSON.parse(raw);
}

// ── Shared validator helpers ─────────────────────────────────────────────────
function str(v, max) { return String(v || '').slice(0, max || 300); }
function arr(v) { return Array.isArray(v) ? v : []; }

// ── 1. Infographic ───────────────────────────────────────────────────────────
// Works for Trip, Guide, or Compare results. The caller passes the
// already-computed free-lookup JSON in params.result so we enrich,
// not re-fetch.
export async function buildInfographic(env, params) {
  const { result, subkind, country, gesture, fromCountry, toCountry } = params;
  if (!result) throw new Error('missing_result');

  const model = getOpenAI(env, 1400, 'gpt-4o');

  let system, prompt;
  if (subkind === 'trip') {
    system = 'You are a cultural-intelligence designer. Create concise, visually structured content for an infographic about culture shift. Respond ONLY with valid JSON, no markdown.';
    prompt = `Trip: ${str(fromCountry, 80)} → ${str(toCountry, 80)}.
Existing data: ${JSON.stringify(result).slice(0, 3000)}

Produce an infographic content object with:
- title: catchy headline (≤60 chars)
- subtitle: one sentence
- summary: 2-sentence overview
- highlights: array of exactly 6 objects { label, from_value, to_value, icon_hint } — the sharpest contrasts
- tip_of_the_day: one memorable tip (≤120 chars)
- tone: "friendly"

Respond ONLY with JSON: {"title":"..","subtitle":"..","summary":"..","highlights":[{"label":"..","from_value":"..","to_value":"..","icon_hint":".."}],"tip_of_the_day":".."}`;
  } else if (subkind === 'compare') {
    system = 'You are a cultural-intelligence designer. Create concise content for a comparison infographic. Respond ONLY with valid JSON, no markdown.';
    prompt = `Comparison of "${str(gesture, 200)}" across countries.
Existing data: ${JSON.stringify(result).slice(0, 3000)}

Produce:
- title: ≤60 chars
- subtitle: one sentence
- gesture_description: 1-2 sentences about the gesture
- country_cards: array of objects { country, verdict, verdict_label, key_note } — one per result entry
- key_takeaway: one sentence

Respond ONLY with JSON: {"title":"..","subtitle":"..","gesture_description":"..","country_cards":[{"country":"..","verdict":"polite"|"caution"|"rude","verdict_label":"..","key_note":".."}],"key_takeaway":".."}`;
  } else {
    // guide
    system = 'You are a cultural-intelligence designer. Create structured content for a country etiquette infographic. Respond ONLY with valid JSON, no markdown.';
    prompt = `Country etiquette guide for ${str(country, 80)}.
Existing data: ${JSON.stringify(result).slice(0, 3000)}

Produce:
- title: "Essential Etiquette: [Country]" (≤60 chars)
- subtitle: the guide's intro sentence
- sections: array of up to 6 objects { category, headline, detail } drawn from the tips
- did_you_know: one surprising fact (≤120 chars)

Respond ONLY with JSON: {"title":"..","subtitle":"..","sections":[{"category":"..","headline":"..","detail":".."}],"did_you_know":".."}`;
  }

  const out = await jsonLLM(model, system, prompt);

  // Minimal validation
  if (!out || !out.title) throw new Error('invalid_infographic');
  return out;
}

export function validateInfographic(d) {
  return d && typeof d.title === 'string' && d.title.length > 0;
}

// ── 2. Country PDF Dossier ───────────────────────────────────────────────────
export async function buildDossier(env, params) {
  const { country, result } = params;
  if (!country) throw new Error('missing_country');

  const model = getOpenAI(env, 2400, 'gpt-4o');
  const context = result ? `\nExisting guide data to incorporate:\n${JSON.stringify(result).slice(0, 2000)}` : '';

  const out = await jsonLLM(model,
    'You are a world-class cultural etiquette expert and travel writer. Produce a comprehensive, specific, factually grounded country etiquette dossier. Respond ONLY with valid JSON, no markdown.',
    `Generate a complete etiquette dossier for ${str(country, 80)}.${context}

Include:
- country: "${str(country, 80)}"
- tagline: memorable one-liner about the culture (≤80 chars)
- overview: 3-4 sentences on cultural mindset and values
- categories: array of exactly 8 objects { name, tips: [string × 3] } covering:
  Greetings, Dining, Business, Dress Code, Religion & Sacred Spaces,
  Gift Giving, Communication Style, Taboos & Don'ts
- essential_phrases: array of 6 objects { phrase_local, romanization, meaning }
  (most important phrases a visitor must know)
- quick_facts: object { official_language, religion, tipping_norm, punctuality, personal_space }
- emergency_tip: single most critical thing to never do (≤120 chars)

Respond ONLY with JSON (no markdown).`
  );

  if (!out || !out.country || !Array.isArray(out.categories)) throw new Error('invalid_dossier');
  return out;
}

export function validateDossier(d) {
  return d && typeof d.country === 'string' && Array.isArray(d.categories) && d.categories.length >= 4;
}

// ── 3. Scenario Coach ────────────────────────────────────────────────────────
// scenario: sanitized free-text situation (PII already stripped by generate.js).
export async function buildScenario(env, params) {
  const { scenario, country } = params;
  if (!scenario || !country) throw new Error('missing_params');

  const model = getOpenAI(env, 1200, 'gpt-4o-mini');

  const out = await jsonLLM(model,
    'You are a cross-cultural etiquette coach. Give specific, actionable coaching for the described scenario. Respond ONLY with valid JSON, no markdown.',
    `Country: ${str(country, 80)}.
Scenario: ${JSON.stringify(str(scenario, 600))}

Produce a coaching card:
- situation_summary: 1-sentence neutral restatement of the scenario (no PII)
- cultural_context: 2-3 sentences explaining why this matters in this culture
- recommended_action: what to DO (one clear sentence)
- what_to_avoid: what NOT to do (one clear sentence)
- local_phrase: one helpful phrase in the local language with romanization and translation
- confidence: "high"|"medium"|"low"
- disclaimer: "Cultural norms vary — always follow local cues."

Respond ONLY with JSON: {"situation_summary":"..","cultural_context":"..","recommended_action":"..","what_to_avoid":"..","local_phrase":{"text":"..","romanization":"..","meaning":".."},"confidence":"..","disclaimer":".."}`,
  );

  if (!out || !out.recommended_action) throw new Error('invalid_scenario');
  return out;
}

export function validateScenario(d) {
  return d && typeof d.recommended_action === 'string';
}

// ── 4. Etiquette Certificate ─────────────────────────────────────────────────
// The pass gate lives in /api/generate: it re-scores the answers against the
// signed quiz token (src/_quiztoken.js), and country/score here come from that.
export async function buildCertificate(env, params) {
  const { country, score, totalQuestions, recipientName } = params;
  if (!country) throw new Error('missing_country');

  // No AI call needed for the certificate — the structure is deterministic.
  // We just return the data object the template renders.
  const safeScore = Math.min(Math.max(parseInt(score) || 0, 0), totalQuestions || 5);
  const pct = Math.round((safeScore / (totalQuestions || 5)) * 100);
  const grade = pct >= 90 ? 'Distinction' : pct >= 80 ? 'Merit' : 'Pass';

  return {
    country: str(country, 80),
    recipientName: str(recipientName || 'Explorer', 60),
    score: safeScore,
    totalQuestions: totalQuestions || 5,
    pct,
    grade,
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    certId: 'IIP-' + Date.now().toString(36).toUpperCase(),
  };
}

export function validateCertificate(d) {
  return d && typeof d.country === 'string' && typeof d.score === 'number';
}

// ── 5. Phrasebook + Do/Don't Card ────────────────────────────────────────────
export async function buildPhrasebook(env, params) {
  const { country, result } = params;
  if (!country) throw new Error('missing_country');

  const model = getOpenAI(env, 1800, 'gpt-4o');
  const context = result ? `\nExisting guide data:\n${JSON.stringify(result).slice(0, 1500)}` : '';

  const out = await jsonLLM(model,
    'You are a cultural etiquette and language expert. Produce an accurate phrasebook and etiquette card for a traveler. Respond ONLY with valid JSON, no markdown.',
    `Country: ${str(country, 80)}.${context}

Produce:
- country: "${str(country, 80)}"
- script_note: brief note about the writing system (e.g. "Uses Arabic script — right to left")
- phrases: array of exactly 12 objects { category, phrase_local, romanization, english, usage_note }
  Categories must cover: Greetings, Farewells, Dining, Shopping, Emergencies, Politeness
- dos: array of exactly 6 short do's (one sentence each)
- donts: array of exactly 6 short don'ts (one sentence each)
- cultural_tip: one memorable tip (≤120 chars)

Respond ONLY with JSON (no markdown).`
  );

  if (!out || !Array.isArray(out.phrases) || !Array.isArray(out.dos)) throw new Error('invalid_phrasebook');
  return out;
}

export function validatePhrasebook(d) {
  return d && Array.isArray(d.phrases) && d.phrases.length >= 6 && Array.isArray(d.dos);
}
