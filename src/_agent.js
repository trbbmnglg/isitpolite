// LangGraph agent layer (runs on Cloudflare Workers via nodejs_compat).
// Model: DeepSeek through LangChain's OpenAI-compatible ChatOpenAI.
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';

function getModel(env, maxTokens) {
  return new ChatOpenAI({
    model: 'deepseek-chat',
    apiKey: env.DEEPSEEK_API_KEY,
    temperature: 0.2,
    maxTokens: maxTokens || 450,
    configuration: { baseURL: 'https://api.deepseek.com/v1' },
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

// ── Tavily web search (real-source grounding) ────────────────────────────
async function tavilySearch(env, query) {
  if (!env.TAVILY_API_KEY) return [];
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query: query, search_depth: 'basic', max_results: 4 }),
    });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.results || []).map(function (r) { return { title: r.title || '', content: r.content || '', url: r.url || '' }; });
  } catch (_) {
    return [];
  }
}

function sourcesBlock(sources) {
  if (!sources || !sources.length) return '';
  return sources.slice(0, 4)
    .map(function (s, i) { return '[' + (i + 1) + '] ' + s.title + ': ' + s.content; })
    .join('\n').slice(0, 2800);
}

const CONTEXT_LABELS = {
  general: 'General / everyday', business: 'Business / work',
  dining: 'Dining / restaurant', religion: 'Religious setting',
  social: 'Social gathering', family: 'Meeting family',
};

// ── Report adjudication graph: screen → corroborate → decide ─────────────
const ReportState = Annotation.Root({
  gesture: Annotation(),
  country: Annotation(),
  context: Annotation(),
  verdict: Annotation(),
  verdictLabel: Annotation(),
  correction: Annotation(),
  legitimate: Annotation(),
  trollOrSpam: Annotation(),
  containsPii: Annotation(),
  plausible: Annotation(),
  corroborated: Annotation(),
  confidence: Annotation(),
  rationale: Annotation(),
  summary: Annotation(),
  accepted: Annotation(),
});

export async function runReportAgent(env, input) {
  const model = getModel(env);

  // Node 1 — moderation gate.
  async function screen(state) {
    const out = await jsonLLM(model,
      'You are a strict content-moderation agent for a cultural-etiquette website. Respond ONLY with valid JSON, no markdown.',
      'Verdict under review: "' + state.gesture + '" in ' + state.country + ' (context: ' + state.context + '). Our current verdict: ' + state.verdict + '.\n\n' +
      'A visitor submitted this as a correction:\n"""' + state.correction + '"""\n\n' +
      'Return JSON: {"legitimate": true|false (good-faith, on-topic etiquette report — not empty, nonsense, or off-topic), "troll_or_spam": true|false (abuse, trolling, ads, gibberish), "contains_pii": true|false (mentions a private individual\'s name, email, phone, address, or ID)}');
    return { legitimate: !!out.legitimate, trollOrSpam: !!out.troll_or_spam, containsPii: !!out.contains_pii };
  }

  // Node 2 — multi-step corroboration: cross-check the claim against
  // established cultural knowledge, reason about variation, strip PII.
  async function corroborate(state) {
    // Real-source grounding: search the web for the claim before judging.
    const sources = await tavilySearch(env, 'is "' + state.gesture + '" considered polite or rude in ' + state.country + '? cultural etiquette');
    const srcBlock = sourcesBlock(sources);
    const out = await jsonLLM(model,
      'You are a cultural-etiquette fact-checking agent. Cross-check the visitor\'s claimed correction against the provided web sources AND well-established cultural knowledge. Reason about regional and generational variation and how widely the claim actually holds. Remove any personal data. Respond ONLY with valid JSON, no markdown.',
      'Country: ' + state.country + '. Context: ' + state.context + '. Gesture/behavior: "' + state.gesture + '". Our current verdict: ' + state.verdict + (state.verdictLabel ? ' ("' + state.verdictLabel + '")' : '') + '.\n\n' +
      'Visitor\'s claimed correction:\n"""' + state.correction + '"""\n\n' +
      (srcBlock ? 'Web sources to corroborate against:\n' + srcBlock + '\n\n' : '') +
      'Return JSON: {"plausible": true|false (culturally plausible at all), "corroborated": true|false (supported by the sources / well-established knowledge — NOT fringe, anecdotal, or incorrect), "confidence": "high"|"medium"|"low", "rationale": "<=200 chars of cultural reasoning, referencing the sources where relevant", "sanitized_summary": "<=160 char neutral paraphrase of the correction with ALL personal data removed"}');
    return {
      plausible: !!out.plausible,
      corroborated: !!out.corroborated,
      confidence: ['high', 'medium', 'low'].indexOf(out.confidence) !== -1 ? out.confidence : 'low',
      rationale: String(out.rationale || '').slice(0, 200),
      summary: String(out.sanitized_summary || '').slice(0, 200),
    };
  }

  // Node 3 — deterministic decision.
  function decide(state) {
    const accepted = !!(state.legitimate && !state.trollOrSpam && state.plausible && state.corroborated && state.confidence !== 'low');
    return { accepted: accepted };
  }

  function routeAfterScreen(state) {
    return (state.legitimate && !state.trollOrSpam) ? 'corroborate' : 'decide';
  }

  const graph = new StateGraph(ReportState)
    .addNode('screen', screen)
    .addNode('corroborate', corroborate)
    .addNode('decide', decide)
    .addEdge(START, 'screen')
    .addConditionalEdges('screen', routeAfterScreen, { corroborate: 'corroborate', decide: 'decide' })
    .addEdge('corroborate', 'decide')
    .addEdge('decide', END)
    .compile();

  const res = await graph.invoke({
    gesture: input.gesture,
    country: input.country,
    context: input.context,
    verdict: input.verdict,
    verdictLabel: input.verdictLabel || '',
    correction: input.correction,
  });

  return {
    accepted: !!res.accepted,
    summary: res.summary || '',
    confidence: res.confidence || 'low',
    rationale: res.rationale || '',
    containsPii: !!res.containsPii,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// RETRIEVAL-AUGMENTED LOOKUP AGENT (Check / Compare / Trip / Guide / Quiz)
// Graph: retrieve (Tavily) → generate (grounded LLM) → reflect (validate,
// self-correct up to 2 attempts). Mode-specific query + prompt + schema.
// ═════════════════════════════════════════════════════════════════════════
function ground(srcBlock) {
  return srcBlock
    ? '\n\nUse these web sources to ground and fact-check your answer — prefer them over assumptions, note where they disagree or vary by region, and stay specific:\n' + srcBlock
    : '\n\n(No web sources available — use your own expert knowledge.)';
}

const LOOKUP_MODES = {
  check: {
    tokens: 800,
    query: function (p) { return 'is "' + p.gesture + '" considered polite or rude in ' + p.country + '? cultural etiquette ' + (CONTEXT_LABELS[p.context] || ''); },
    system: 'You are a world-class cultural etiquette expert. Respond ONLY with valid JSON, no markdown.',
    prompt: function (p, src) {
      const cl = CONTEXT_LABELS[p.context] || p.context;
      return 'Question: is "' + p.gesture + '" polite in ' + p.country + '? Context: ' + cl + '.\n' +
        'Be specific to ' + p.country + '; explanation factual (2-3 sentences); local_tip actionable; confidence reflects how universal the norm is; regional_note flags variation or empty; also_check = 3 countries where it lands differently.' + ground(src) + '\n\n' +
        'Respond ONLY with JSON: {"verdict":"polite"|"caution"|"rude","verdict_label":"3-5 words","confidence":"high"|"medium"|"low","explanation":"2-3 sentences","local_tip":"one sentence","regional_note":"one sentence or empty string","also_check":[{"country":"..","verdict":"polite"|"caution"|"rude","note":".."},{"country":"..","verdict":"..","note":".."},{"country":"..","verdict":"..","note":".."}]}';
    },
    valid: function (d) { return d && ['polite', 'caution', 'rude'].indexOf(String(d.verdict).toLowerCase()) !== -1 && d.explanation && Array.isArray(d.also_check); },
  },
  guide: {
    tokens: 1600,
    query: function (p) { return p.country + ' cultural etiquette guide for visitors customs taboos dining greetings'; },
    system: 'You are a world-class cultural etiquette expert. Respond ONLY with valid JSON, no markdown.',
    prompt: function (p, src) {
      return 'Generate an "Essential Etiquette Guide for Visitors to ' + p.country + '" with exactly 8 practical tips across varied categories.' + ground(src) + '\n\n' +
        'Respond ONLY with JSON: {"country":"' + p.country + '","intro":"one engaging sentence","tips":[{"title":"short tip title","body":"2 sentences max","category":"greeting|dining|body_language|dress|religion|business|gift_giving|general"}]} — exactly 8 tips.';
    },
    valid: function (d) { return d && Array.isArray(d.tips) && d.tips.length >= 4; },
  },
  quiz: {
    tokens: 1900,
    query: function (p) { return p.country + ' cultural etiquette customs taboos facts for travelers'; },
    system: 'You are a cultural etiquette expert. Respond ONLY with valid JSON, no markdown.',
    prompt: function (p, src) {
      return 'Generate a 5-question multiple-choice quiz about etiquette and customs in ' + p.country + '. Each is a realistic visitor scenario; options plausible but only one clearly correct.' + ground(src) + '\n\n' +
        'Respond ONLY with JSON: {"country":"' + p.country + '","questions":[{"question":"scenario (1-2 sentences)","options":["A","B","C","D"],"correct":0,"explanation":"2 sentences"}]} — exactly 5 questions; "correct" is the 0-based index.';
    },
    valid: function (d) { return d && Array.isArray(d.questions) && d.questions.length >= 3 && d.questions[0] && Array.isArray(d.questions[0].options); },
  },
  compare: {
    tokens: 1000,
    query: function (p) { return '"' + p.gesture + '" cultural meaning etiquette in ' + (p.countries || []).join(', '); },
    system: 'You are a world-class cultural etiquette expert. Respond ONLY with valid JSON, no markdown.',
    prompt: function (p, src) {
      const countries = p.countries || [];
      return 'Compare how the gesture/behavior "' + p.gesture + '" is perceived across: ' + countries.join(', ') + '. For EACH country, give a verdict + one-sentence explanation specific to it.' + ground(src) + '\n\n' +
        'Respond ONLY with JSON: {"gesture":"' + p.gesture + '","summary":"one sentence on the most striking contrast","results":[{"country":"' + (countries[0] || '') + '","verdict":"polite"|"caution"|"rude","verdict_label":"2-4 words","note":"one sentence"}]} — one entry per country, same order.';
    },
    valid: function (d) { return d && Array.isArray(d.results) && d.results.length >= 1; },
  },
  trip: {
    tokens: 1700,
    query: function (p) { return 'cultural etiquette differences between ' + p.from + ' and ' + p.to + ' for travelers customs'; },
    system: 'You are a world-class cross-cultural etiquette expert. Respond ONLY with valid JSON, no markdown.',
    prompt: function (p, src) {
      return 'A traveler from ' + p.from + ' is visiting ' + p.to + '. Explain what THEY must adjust — the highest-contrast etiquette differences, framed from a ' + p.from + ' perspective.' + ground(src) + '\n\n' +
        'Respond ONLY with JSON: {"from":"' + p.from + '","to":"' + p.to + '","summary":"2 sentences on the overall shift","differences":[{"category":"Greetings|Dining|Tipping|Personal space|Gestures|Dress|Punctuality|Gift-giving|Communication style","from_norm":"short","to_norm":"short","tip":"what to DO"}]} — 6 differences.';
    },
    valid: function (d) { return d && Array.isArray(d.differences) && d.differences.length >= 1; },
  },
};

const LookupState = Annotation.Root({
  mode: Annotation(),
  params: Annotation(),
  sources: Annotation(),
  draft: Annotation(),
  attempts: Annotation(),
  valid: Annotation(),
});

export async function runLookupAgent(env, mode, params) {
  const cfg = LOOKUP_MODES[mode];
  if (!cfg) throw new Error('unknown_mode');
  const model = getModel(env, cfg.tokens);

  async function retrieve(state) {
    const sources = await tavilySearch(env, cfg.query(params));
    return { sources: sources, attempts: 0 };
  }
  async function generate(state) {
    let draft = null;
    try { draft = await jsonLLM(model, cfg.system, cfg.prompt(params, sourcesBlock(state.sources))); }
    catch (_) { draft = null; }
    return { draft: draft, attempts: (state.attempts || 0) + 1 };
  }
  function reflect(state) { return { valid: !!cfg.valid(state.draft) }; }
  function routeAfterReflect(state) {
    if (state.valid || (state.attempts || 0) >= 2) return 'done';
    return 'generate';
  }

  const graph = new StateGraph(LookupState)
    .addNode('retrieve', retrieve)
    .addNode('generate', generate)
    .addNode('reflect', reflect)
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'generate')
    .addEdge('generate', 'reflect')
    .addConditionalEdges('reflect', routeAfterReflect, { generate: 'generate', done: END })
    .compile();

  const res = await graph.invoke({ mode: mode, params: params });
  if (!res.draft) throw new Error('parse_failed');
  return res.draft;
}

// ── Feedback sanitizer (LangChain single call) ───────────────────────────
export async function sanitizeFeedback(env, message) {
  const model = getModel(env);
  return await jsonLLM(model,
    'You sanitize website feedback. Remove ALL personal data and paraphrase neutrally. Respond ONLY with valid JSON, no markdown.',
    'Visitor feedback:\n"""' + message + '"""\n\n' +
    'Return JSON: {"sanitized_summary":"<=160 char neutral paraphrase with ALL personal data removed","sentiment":"positive"|"neutral"|"negative","is_spam":true|false}');
}
