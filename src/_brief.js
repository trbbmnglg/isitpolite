// Trip briefing lookup mode: the etiquette points most likely to catch out a
// traveler from one country visiting another, grounded first in our reviewed
// guide records, then in web sources. Registered in LOOKUP_MODES (_agent.js).
import { CONTEXT_LABELS, MONTHS } from './_countries.js';
import { REVIEWED } from './_reviewed.js';
import { holidaysFor } from './_holidays.js';

const SEVERITY = ['high', 'medium', 'low'];
const SOURCE_COUNT = 8;
const CONTEXT_KEYS = Object.keys(CONTEXT_LABELS);
// Exact or narrowed dates ("3 March", "March 3rd", "late March") — never allowed for movable holidays.
const EXACT_DATE = new RegExp('\\b(\\d{1,2}(st|nd|rd|th)?\\s+(' + MONTHS.join('|') + ')|(' + MONTHS.join('|') + ')\\s+\\d{1,2}(st|nd|rd|th)?|(early|mid|late)[\\s-]+(' + MONTHS.join('|') + '))\\b', 'i');

function clip(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }

// The next occurrence of the month, counted in UTC (this month counts as now).
export function briefYear(month, now) {
  const d = now || new Date();
  return month >= d.getUTCMonth() + 1 ? d.getUTCFullYear() : d.getUTCFullYear() + 1;
}

function reviewedBlock(country, role) {
  const r = REVIEWED[country];
  if (!r) return '';
  return '\n\nReviewed facts for ' + country + ' (' + role + '; fact-checked against published sources; where they apply, they override the web sources and your own knowledge):\n' +
    r.items.map(function (i) { return '- [' + i.key + '] ' + i.gesture + ': ' + i.verdict + ' (' + i.label + '). ' + i.tip; }).join('\n');
}

const STOP = new Set(['the', 'and', 'for', 'with', 'season', 'holiday', 'holidays', 'festival', 'festivals', 'travel', 'day', 'days', 'week', 'weekend', 'period', 'time', 'public', 'national', 'new']);

// A seasonal note is kept only if its cited source actually mentions the event.
function sourceMentions(src, title) {
  const hay = (src.title + ' ' + (src.content || '')).toLowerCase();
  const words = String(title).toLowerCase().split(/[^a-zÀ-ɏ]+/).filter(function (w) { return w.length >= 4 && !STOP.has(w); });
  return words.length > 0 && words.some(function (w) { return hay.indexOf(w) !== -1; });
}

export function briefMode(ground) {
  return {
    tokens: 2600,
    sourceCount: SOURCE_COUNT,
    sourceChars: 4200,
    query: function (p) {
      const focus = p.contexts.filter(function (c) { return c !== 'general'; })[0];
      const qs = [
        p.to + ' etiquette tips for visitors from ' + p.from + ' culture shock customs',
        p.to + ' etiquette ' + (focus ? CONTEXT_LABELS[focus] : 'greetings dining tipping') + ' mistakes visitors make',
      ];
      if (p.month) qs.push(p.to + ' public holidays festivals ' + MONTHS[p.month - 1] + ' ' + briefYear(p.month));
      return qs;
    },
    system: 'You are a world-class cross-cultural etiquette expert who briefs travelers before a trip. Respond ONLY with valid JSON, no markdown.',
    prompt: function (p, src) {
      const acts = (p.contexts.length ? p.contexts : ['general']).map(function (c) { return CONTEXT_LABELS[c]; }).join(', ');
      const when = p.month ? MONTHS[p.month - 1] + ' ' + briefYear(p.month) : '';
      const reviewed = REVIEWED[p.to];
      return 'Brief a traveler from ' + p.from + ' who is going to ' + p.to + '. They will be: ' + acts + '.' + (when ? ' They travel in ' + when + '.' : '') + '\n' +
        'List the 8-10 etiquette points most likely to catch out someone from ' + p.from + ' specifically. Skip anything that works the same in both countries. ' +
        'Write from_norm from the ' + p.from + ' point of view. Order by severity, high first. Cover each of their activities at least once. Be concrete; no generic advice such as "be respectful".\n' +
        'Accuracy rules: never invent or exaggerate a norm in either country to create a contrast; fewer, true points beat more points. Describe ' + p.from + ' norms only as they really are (use its reviewed facts when given). ' +
        'When a reviewed fact applies, match its strength: "caution" means awkward or situational, not offensive.' +
        (reviewed ? ' If a point matches one of the reviewed facts for ' + p.to + ', set gesture_key to its [key]; otherwise use an empty string.' : ' Set gesture_key to an empty string.') +
        (when
          ? ' In "season", list 0-3 holidays, festivals or seasonal customs in ' + p.to + ' that take place in ' + when + ' and affect visitors, most disruptive to visitors first (closures, fasting, crowds, gift customs). Only include one if a numbered web source names it, and set "source" to that number; otherwise leave it out. For holidays whose dates move each year (lunar or Islamic calendar), set movable to true and say it "may fall in or near ' + MONTHS[p.month - 1] + '"; do not give days or say early, mid or late.'
          : ' Set "season" to an empty array.') +
        reviewedBlock(p.to, 'the destination') + (p.from !== p.to ? reviewedBlock(p.from, 'the traveler\'s home country') : '') + ground(src) + '\n\n' +
        'Respond ONLY with JSON: {"headline":"one sentence: the biggest adjustment for this traveler",' +
        '"watch_outs":[{"title":"3-7 words","category":"Greetings|Dining|Tipping|Gestures|Dress|Religion|Punctuality|Gift-giving|Communication|Personal space|Business",' +
        '"context":"' + CONTEXT_KEYS.join('|') + '","severity":"high|medium|low",' +
        '"from_norm":"what is normal in ' + p.from + ', one short sentence","to_norm":"what is expected in ' + p.to + ', one short sentence",' +
        '"do":"one sentence","avoid":"one sentence","gesture_key":""}],' +
        '"season":[{"title":"..","note":"one or two sentences","movable":false,"source":1}]}';
    },
    valid: function (d) {
      return !!(d && typeof d.headline === 'string' && d.headline.trim() &&
        Array.isArray(d.watch_outs) && d.watch_outs.length >= 5 &&
        d.watch_outs.every(function (w) { return w && w.title && w.do && SEVERITY.indexOf(String(w.severity).toLowerCase()) !== -1; }));
    },
    finalize: finalizeBrief,
  };
}

// Normalise the model output and enforce the trust rules the prompt asks for:
// links only to reviewed pages, and seasonal notes only with a real source
// (and no exact dates for holidays that move every year).
export function finalizeBrief(d, p, sources) {
  const reviewed = REVIEWED[p.to];
  const keys = new Set(reviewed ? reviewed.items.map(function (i) { return i.key; }) : []);
  const order = { high: 0, medium: 1, low: 2 };

  const watchOuts = d.watch_outs.slice(0, 10).map(function (w) {
    const sev = String(w.severity).toLowerCase();
    const key = clip(w.gesture_key, 80);
    return {
      title: clip(w.title, 90),
      category: clip(w.category, 30),
      context: CONTEXT_LABELS[w.context] ? w.context : 'general',
      severity: SEVERITY.indexOf(sev) !== -1 ? sev : 'medium',
      from_norm: clip(w.from_norm, 240),
      to_norm: clip(w.to_norm, 240),
      do: clip(w.do, 240),
      avoid: clip(w.avoid, 240),
      link: reviewed && keys.has(key) ? '/etiquette/' + reviewed.slug + '/' + key + '/' : '',
    };
  }).sort(function (a, b) { return order[a.severity] - order[b.severity]; });

  const used = sources.slice(0, SOURCE_COUNT);
  const season = !p.month || !Array.isArray(d.season) ? [] : d.season.slice(0, 8).map(function (s) {
    const src = used[(parseInt(s && s.source, 10) || 0) - 1];
    return {
      title: clip(s && s.title, 90),
      note: clip(s && s.note, 320),
      movable: !!(s && s.movable),
      source: src && /^https:\/\//.test(src.url) ? { title: clip(src.title, 120), url: src.url } : null,
    };
  }).filter(function (s, i) {
    if (!s.title || !s.note || !s.source || (s.movable && EXACT_DATE.test(s.note))) return false;
    const raw = used[(parseInt(d.season[i] && d.season[i].source, 10) || 0) - 1];
    return sourceMentions(raw, s.title);
  }).slice(0, 3);

  // Verified movable holidays come first; drop model notes about the same event.
  const year = p.month ? briefYear(p.month) : 0;
  const verified = holidaysFor(p.to, p.month, year);
  const verifiedWords = verified.map(function (h) { return h.title.toLowerCase().split(/\s+/)[0]; });
  const modelNotes = season.filter(function (s) {
    const t = s.title.toLowerCase();
    return !verifiedWords.some(function (w) { return t.indexOf(w) !== -1; });
  });

  return {
    from: p.from,
    to: p.to,
    contexts: p.contexts,
    month: p.month || 0,
    year: year,
    headline: clip(d.headline, 240),
    watch_outs: watchOuts,
    season: verified.concat(modelNotes).slice(0, 4),
  };
}
