// Match a Check question to a fact-checked guide record, so it can be answered
// instantly (no AI call) from data that has already been reviewed with sources.
import { REVIEWED } from './_reviewed.js';

export function normalizeGesture(s) {
  return String(s || '').toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

// Exact match on the record's display or short name; the record only applies
// when the asked context is its own context or "general".
export function matchReviewed(params) {
  const r = REVIEWED[params.country];
  if (!r) return null;
  const g = normalizeGesture(params.gesture);
  if (!g) return null;
  const item = r.items.find(function (i) {
    return normalizeGesture(i.gesture) === g || normalizeGesture(i.short) === g;
  });
  if (!item) return null;
  if (params.context !== 'general' && params.context !== item.context) return null;
  return { item: item, slug: r.slug };
}

// The Check response shape, built from a reviewed record.
export function instantAnswer(match) {
  const i = match.item;
  return {
    verdict: i.verdict,
    verdict_label: i.label,
    confidence: i.confidence,
    explanation: i.explanation,
    local_tip: i.tip,
    regional_note: i.regional_note || '',
    also_check: i.also_check || [],
    sources: (i.sources || []).filter(function (s) { return /^https:\/\//.test(s.url); }).slice(0, 4),
    instant: true,
    reviewed: i.reviewed,
    guide_url: '/etiquette/' + match.slug + '/' + i.key + '/',
  };
}
