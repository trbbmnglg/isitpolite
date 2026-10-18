// ── Static HTML templates for the programmatic SEO pages ─────────────────
// Pages are fully self-contained (content baked into HTML for crawlers),
// reuse the site's /style.css, and link back into the interactive app.

import { BASE_URL, SITE_NAME, DONATE_URL, GESTURES, COUNTRIES, CONTEXT_LABELS, countrySlug, gestureSlug } from './seo-data.mjs';
import { VERDICT_LEGEND, CONFIDENCE_LEGEND } from '../src/_labels.js';
import { withThe } from '../src/_countries.js';
import { THEME_HEAD, THEME_BUTTON, THEME_SCRIPT } from './theme.mjs';

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Serialize an object for embedding inside a <script type="application/ld+json">.
// JSON.stringify does NOT escape < > & — so an AI-generated field containing
// "</script>" would break out of the tag (stored XSS). Escaping these to \uXXXX
// keeps the JSON valid (crawlers decode it) and impossible to break out of.
function jsonLdSafe(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

const VERDICT_CLASS = { polite: 'verdict-polite', caution: 'verdict-caution', rude: 'verdict-rude' };
function verdictClass(v) { return VERDICT_CLASS[String(v).toLowerCase()] || 'verdict-caution'; }
function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }

const GLOBE = '<svg class="logo-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="19" height="19" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

function head(opts) {
  const { title, description, canonical, jsonld } = opts;
  const ogImage = BASE_URL + (opts.ogImage || '/og-image.png');
  const ogSize = opts.ogImage ? '\n  <meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />' : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta name="color-scheme" content="light dark" />
  ${THEME_HEAD}
  <meta name="theme-color" content="#FAF7F2" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#14110F" media="(prefers-color-scheme: dark)" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${esc(SITE_NAME)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:image" content="${esc(ogImage)}" />${ogSize}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500..700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css" />
${jsonld.map(j => '  <script type="application/ld+json">' + jsonLdSafe(j) + '</script>').join('\n')}
</head>`;
}

function header() {
  return `<body class="seo-page">
  <header class="site-header" role="banner">
    <div class="header-inner">
      <a class="logo" href="/" aria-label="${esc(SITE_NAME)} — Home"><span class="logo-badge" aria-hidden="true">${GLOBE}</span><span class="logo-text">IsItPolite<span class="logo-dot">.com</span></span></a>
      <span class="header-actions">${THEME_BUTTON}<a class="btn-donate" href="/?support=1">Support</a></span>
    </div>
  </header>`;
}

function footer() {
  return `  <footer class="site-footer" role="contentinfo">
    <div class="footer-bottom">
      <p class="privacy-notice"><a href="/etiquette/">Browse all etiquette guides</a> · <a href="/">Check any gesture</a></p>
      <p class="copyright">© 2026 ${esc(SITE_NAME)} — AI-powered guidance, not absolute rules. Customs vary between people and regions.</p>
    </div>
  </footer>
${THEME_SCRIPT}
</body>
</html>`;
}

function breadcrumbs(trail) {
  // trail: [{name, url}] — last item is current (no link)
  const items = trail.map((t, i) => {
    const last = i === trail.length - 1;
    return last
      ? `<span aria-current="page">${esc(t.name)}</span>`
      : `<a href="${esc(t.url)}">${esc(t.name)}</a>`;
  }).join('<span class="bc-sep">/</span>');
  return `<nav class="seo-breadcrumbs" aria-label="Breadcrumb">${items}</nav>`;
}

function breadcrumbJsonLd(trail) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name,
      ...(t.url ? { item: BASE_URL + t.url } : {}),
    })),
  };
}

function confidenceBadge(level) {
  const c = String(level || '').toLowerCase();
  if (!['high', 'medium', 'low'].includes(c)) return '';
  const label = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[c];
  const dots = { high: 3, medium: 2, low: 1 }[c];
  let pips = '';
  for (let i = 0; i < 3; i++) pips += `<span class="conf-pip${i < dots ? ' on' : ''}"></span>`;
  return `<span class="confidence-badge conf-${c}" title="${label}"><span class="conf-pips" aria-hidden="true">${pips}</span>${label}</span>`;
}

function verdictCard(rec) {
  const cls = verdictClass(rec.verdict);
  const also = (rec.also_check || []).map(item => {
    return `<div class="also-card"><div class="also-card-header"><span class="also-country">${esc(item.country)}</span>${verdictTag(item.verdict)}</div><p class="also-note">${esc(item.note)}</p></div>`;
  }).join('');
  const regional = (rec.regional_note && String(rec.regional_note).trim())
    ? `<div class="card-section"><div class="caveat-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span><strong>Varies locally:</strong> ${esc(rec.regional_note)}</span></div></div>`
    : '';
  return `<article class="result-card ${cls}">
      <div class="verdict-badge"><span class="badge-dot" aria-hidden="true"></span><span class="badge-label">${esc(rec.verdict_label)}</span>${confidenceBadge(rec.confidence)}</div>
      <div class="card-body">
        <div class="card-section"><h2>Explanation</h2><p>${esc(rec.explanation)}</p></div>
        ${regional}
        <div class="card-section"><h2>Local Tip</h2><p class="local-tip-text">${esc(rec.local_tip)}</p></div>
        ${also ? `<div class="card-section"><h2>How it compares elsewhere</h2><div class="also-check-grid">${also}</div></div>` : ''}
        ${legendHtml()}
      </div>
      <div class="result-footnote">${rec.reviewed
        ? 'AI-drafted and fact-checked against the sources below — customs vary between people and regions.'
        : rec.grounded
          ? 'AI-drafted from the sources below and not yet independently reviewed — customs vary between people and regions.'
          : 'AI-generated guidance — customs evolve and vary between people. Treat as a helpful starting point, not absolute rules.'}</div>
    </article>`;
}

function verdictTag(v) {
  const key = String(v || '').toLowerCase();
  const l = VERDICT_LEGEND.find(x => x.key === key) || VERDICT_LEGEND[1];
  return `<span class="v-tag ${l.key}">${esc(l.label)}</span>`;
}

function legendHtml() {
  const rows = VERDICT_LEGEND.map(l => `<div><dt>${verdictTag(l.key)}</dt><dd>${esc(l.text)}</dd></div>`).join('') +
    CONFIDENCE_LEGEND.map(c => `<div><dt><span class="legend-conf">${esc(c.label)}</span></dt><dd>${esc(c.text)}</dd></div>`).join('');
  return `<details class="verdict-legend"><summary>What do these labels mean?</summary><dl>${rows}</dl></details>`;
}

function humanDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function sourceItem(s, rel) {
  let host = '';
  try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
  return `<li><a href="${esc(s.url)}" target="_blank" rel="${rel}">${esc(s.title)}</a> <span class="seo-source-host">${esc(host)}</span></li>`;
}

function sourcesBlock(rec) {
  const dated = rec.reviewed || rec.grounded;
  if (!dated || !Array.isArray(rec.sources) || rec.sources.length === 0) return '';
  const refs = rec.sources.filter(s => s.kind !== 'community').map(s => sourceItem(s, 'noopener')).join('');
  const community = rec.sources.filter(s => s.kind === 'community').map(s => sourceItem(s, 'nofollow ugc noopener')).join('');
  return `<section class="seo-sources" aria-labelledby="sources-title">
      <h2 class="seo-related-title" id="sources-title">Sources</h2>
      ${refs ? `<ul class="seo-source-list">${refs}</ul>` : ''}
      ${community ? `<h3 class="seo-sources-sub">Traveler discussions</h3><ul class="seo-source-list">${community}</ul>` : ''}
      <p class="seo-reviewed">${rec.reviewed ? 'Last reviewed' : 'Drafted from these sources on'} <time datetime="${esc(dated)}">${esc(humanDate(dated))}</time></p>
    </section>`;
}

// ── Pair page: /etiquette/{country}/{gesture}/ ───────────────────────────
export function renderPairPage(pair, rec) {
  const { country, gesture } = pair;
  const cSlug = countrySlug(country), gSlug = gestureSlug(gesture);
  const url = `/etiquette/${cSlug}/${gSlug}/`;
  const canonical = BASE_URL + url;
  const question = `Is ${gesture.display.toLowerCase()} polite in ${country}?`;
  const title = `Is ${gesture.short} Polite in ${country}? — ${SITE_NAME}`;
  const description = truncate(`${rec.verdict_label}. ${rec.explanation}`, 155);

  // Related: other gestures in this country, and same gesture in other countries
  const sameCountry = GESTURES.filter(g => gestureSlug(g) !== gSlug).slice(0, 6).map(g =>
    `<a class="seo-rel-link" href="/etiquette/${cSlug}/${gestureSlug(g)}/">${esc(g.short)} in ${esc(country)}</a>`).join('');
  // Rotate the start point per page so every country gets inbound links, not just the first six.
  const others = COUNTRIES.filter(c => countrySlug(c) !== cSlug);
  const start = (COUNTRIES.findIndex(c => countrySlug(c) === cSlug) * 6 + GESTURES.findIndex(g => gestureSlug(g) === gSlug)) % others.length;
  const otherCountries = others.slice(start).concat(others.slice(0, start)).slice(0, 6).map(c =>
    `<a class="seo-rel-link" href="/etiquette/${countrySlug(c)}/${gSlug}/">${esc(gesture.short)} in ${esc(c)}</a>`).join('');

  const appLink = `/?g=${encodeURIComponent(gesture.display)}&c=${encodeURIComponent(country)}&ctx=${encodeURIComponent(gesture.context)}`;

  // FAQ — visible on the page AND mirrored in FAQPage schema (built from data we already have)
  const faqs = [
    { q: question.charAt(0).toUpperCase() + question.slice(1), a: `${rec.verdict_label}. ${rec.explanation}` },
    { q: `What should I do instead in ${country}?`, a: rec.local_tip },
  ];
  if (rec.regional_note && String(rec.regional_note).trim()) {
    faqs.push({ q: `Does ${gesture.short.toLowerCase()} mean the same everywhere in ${country}?`, a: rec.regional_note });
  }
  const faqHtml = faqs.map(f => `<details class="faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');

  const jsonld = [
    breadcrumbJsonLd([
      { name: 'Home', url: '/' },
      { name: 'Etiquette', url: '/etiquette/' },
      { name: country, url: `/etiquette/${cSlug}/` },
      { name: gesture.short, url },
    ]),
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];
  if (rec.reviewed || rec.grounded) {
    jsonld.push({
      '@context': 'https://schema.org', '@type': 'WebPage',
      url: canonical, name: title, dateModified: rec.reviewed || rec.grounded,
      ...(Array.isArray(rec.sources) && rec.sources.length
        ? { citation: rec.sources.filter(s => s.kind !== 'community').map(s => s.url) } : {}),
    });
  }

  return `${head({ title, description, canonical, jsonld, ogImage: `/og/${cSlug}/${gSlug}.png` })}
${header()}
  <main class="seo-main">
    ${breadcrumbs([
      { name: 'Home', url: '/' },
      { name: 'Etiquette', url: '/etiquette/' },
      { name: country, url: `/etiquette/${cSlug}/` },
      { name: gesture.short, url },
    ])}
    <div class="seo-hero">
      <p class="seo-kicker">${esc(country)} · ${esc(CONTEXT_LABELS[gesture.context] || gesture.context)}</p>
      <h1>${esc(question.charAt(0).toUpperCase() + question.slice(1))}</h1>
    </div>
    ${verdictCard(rec)}
    ${sourcesBlock(rec)}
    <section class="seo-faq">
      <h2 class="seo-related-title">Frequently asked</h2>
      ${faqHtml}
    </section>
    <div class="seo-cta">
      <p>Want to check a different gesture, country, or situation?</p>
      <a class="btn-cta" href="${appLink}">Check it on IsItPolite →</a>
    </div>
    <section class="seo-related">
      <h2 class="seo-related-title">More etiquette in ${esc(country)}</h2>
      <div class="seo-rel-grid">${sameCountry}</div>
      <h2 class="seo-related-title">“${esc(gesture.short)}” in other countries</h2>
      <div class="seo-rel-grid">${otherCountries}</div>
      <p class="seo-hub-link"><a href="/etiquette/${cSlug}/">See the full ${esc(country)} etiquette guide →</a></p>
    </section>
  </main>
${footer()}`;
}

// ── Country hub: /etiquette/{country}/ ───────────────────────────────────
export function renderCountryHub(country, records, originLinks = []) {
  const cSlug = countrySlug(country);
  const url = `/etiquette/${cSlug}/`;
  const canonical = BASE_URL + url;
  const title = `${country} Etiquette Guide: Customs, Gestures & Taboos — ${SITE_NAME}`;
  const description = truncate(`A traveler's guide to etiquette in ${country}: tipping, gestures, dining, greetings and cultural taboos. Know what's polite before you go.`, 155);

  // records: array of { gesture, rec } that exist for this country
  const cards = records.map(({ gesture, rec }) => {
    const v = String(rec.verdict || 'caution').toLowerCase();
    return `<a class="seo-gesture-card" href="/etiquette/${cSlug}/${gestureSlug(gesture)}/">
        <span class="seo-gc-head"><span class="mini-dot ${esc(v)}" aria-hidden="true"></span><span class="seo-gc-title">${esc(gesture.short)}</span></span>
        <span class="seo-gc-verdict ${esc(v)}">${esc(rec.verdict_label)}</span>
      </a>`;
  }).join('');

  // Build a "Key highlights" section from real data — picks a rude + a polite + a caution
  // example (or whatever mix exists) to give the hub page substantive, unique text content.
  const byVerdict = v => records.filter(r => String(r.rec.verdict||'').toLowerCase() === v);
  const highlights = [
    ...byVerdict('rude').slice(0, 1),
    ...byVerdict('polite').slice(0, 1),
    ...byVerdict('caution').slice(0, 1),
  ].slice(0, 3);
  const highlightsHtml = highlights.length
    ? `<section class="seo-highlights">
      <h2>Cultural highlights for ${esc(country)}</h2>
      <ul class="seo-highlights-list">${highlights.map(({ gesture, rec }) => {
        const v = String(rec.verdict || 'caution').toLowerCase();
        const gUrl = `/etiquette/${cSlug}/${gestureSlug(gesture)}/`;
        return `<li><a href="${esc(gUrl)}" class="seo-highlight-link"><span class="mini-dot ${esc(v)}" aria-hidden="true"></span><strong>${esc(gesture.short)}</strong></a> — ${esc(truncate(rec.explanation, 120))}</li>`;
      }).join('')}</ul>
    </section>` : '';

  const politeCount = byVerdict('polite').length;
  const rudeCount   = byVerdict('rude').length;
  const totalCount  = records.length;
  const summaryLine = totalCount > 0
    ? `This guide covers ${totalCount} common gesture${totalCount !== 1 ? 's' : ''} and custom${totalCount !== 1 ? 's' : ''} in ${esc(country)}: ${politeCount} considered polite, ${rudeCount} potentially rude, and the rest context-dependent.`
    : '';

  const jsonld = [
    breadcrumbJsonLd([
      { name: 'Home', url: '/' },
      { name: 'Etiquette', url: '/etiquette/' },
      { name: country, url },
    ]),
    {
      '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: records.map(({ gesture }, i) => ({
        '@type': 'ListItem', position: i + 1,
        name: `${gesture.short} in ${country}`,
        url: `${BASE_URL}/etiquette/${cSlug}/${gestureSlug(gesture)}/`,
      })),
    },
  ];

  return `${head({ title, description, canonical, jsonld, ogImage: `/og/${cSlug}.png` })}
${header()}
  <main class="seo-main">
    ${breadcrumbs([
      { name: 'Home', url: '/' },
      { name: 'Etiquette', url: '/etiquette/' },
      { name: country, url },
    ])}
    <div class="seo-hero">
      <p class="seo-kicker">Cultural etiquette guide</p>
      <h1>${esc(country)} Etiquette: What's Polite &amp; What's Rude</h1>
      <p class="seo-hero-sub">${summaryLine || `Quick verdicts on the gestures and customs travelers ask about most in ${esc(country)}.`} Tap any topic for the full explanation and a local tip.</p>
    </div>
    ${highlightsHtml}
    <h2 class="seo-related-title">All etiquette guides for ${esc(country)}</h2>
    <div class="seo-gesture-grid">${cards}</div>
    <div class="seo-cta">
      <p>Have a specific question about ${esc(country)}?</p>
      <a class="btn-cta" href="/?c=${encodeURIComponent(country)}">Ask it on IsItPolite →</a>
      <p class="seo-quiz-link"><a href="/?quiz=${encodeURIComponent(country)}#/quiz">Take the 5-question ${esc(country)} quiz →</a></p>
      ${originLinks.map(o => `<p class="seo-quiz-link"><a href="${esc(o.href)}">${esc(o.label)} →</a></p>`).join('')}
    </div>
  </main>
${footer()}`;
}

// ── SEO index: /etiquette/ ───────────────────────────────────────────────
export function renderSeoIndex(countriesWithCounts, originGroups = []) {
  const url = '/etiquette/';
  const canonical = BASE_URL + url;
  const title = `Cultural Etiquette Guides by Country — ${SITE_NAME}`;
  const description = `Browse cultural etiquette guides for countries around the world. Is it polite? Find out before you travel — gestures, dining, tipping and taboos.`;

  const cards = countriesWithCounts.map(({ country, count }) =>
    `<a class="seo-country-card" href="/etiquette/${countrySlug(country)}/"><span class="seo-cc-name">${esc(country)}</span><span class="seo-cc-count">${count} guides</span></a>`
  ).join('');

  const jsonld = [breadcrumbJsonLd([{ name: 'Home', url: '/' }, { name: 'Etiquette', url }])];

  return `${head({ title, description, canonical, jsonld })}
${header()}
  <main class="seo-main">
    ${breadcrumbs([{ name: 'Home', url: '/' }, { name: 'Etiquette', url }])}
    <div class="seo-hero">
      <p class="seo-kicker">Browse by country</p>
      <h1>Cultural Etiquette Guides</h1>
      <p class="seo-hero-sub">Know what's polite before you go. Pick a country to see quick verdicts on the gestures and customs travelers ask about most.</p>
    </div>
    <div class="seo-country-grid">${cards}</div>
    ${originGroups.map(g => `<section class="seo-origin-index"><h2 class="seo-related-title">Guides for ${esc(g.adjective)} travelers</h2><div class="seo-country-grid">${g.pages.map(pg => `<a class="seo-country-card" href="${esc(pg.href)}"><span class="seo-cc-name">${esc(pg.dest)}</span><span class="seo-cc-count">What changes for ${esc(g.demonym)}</span></a>`).join('')}</div></section>`).join('')}
  </main>
${footer()}`;
}

// ── "Etiquette for <demonym>" page: /etiquette/<slug>/<dest>/ ──────────────
const SEV_LABEL = { high: 'Most important', medium: 'Worth knowing', low: 'Minor' };
const SEV_CLASS = { high: 'rude', medium: 'caution', low: 'polite' };
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

export function renderOriginPage(page, dest, rec, hasHub) {
  const dSlug = countrySlug(dest);
  const url = `/etiquette/${page.slug}/${dSlug}/`;
  const canonical = BASE_URL + url;
  const fromThe = withThe(page.origin), destThe = withThe(dest);
  const title = `${dest} Etiquette for ${page.demonym}: What's Different From Home — ${SITE_NAME}`;
  const description = truncate(rec.headline, 155);
  const items = (rec.watch_outs || []).map(w => {
    const sev = SEV_CLASS[w.severity] ? w.severity : 'medium';
    const link = /^\/etiquette\/[a-z0-9-]+\/[a-z0-9-]+\/$/.test(w.link || '') ? w.link : '';
    return `<li class="brief-item">
        <div class="brief-item-head"><span class="sev-chip ${SEV_CLASS[sev]}">${SEV_LABEL[sev]}</span><span class="brief-cat">${esc(w.category)}</span></div>
        <h3 class="brief-item-title">${esc(w.title)}</h3>
        <dl class="brief-compare"><div><dt>In ${esc(fromThe)}</dt><dd>${esc(w.from_norm)}</dd></div><div><dt>In ${esc(destThe)}</dt><dd>${esc(w.to_norm)}</dd></div></dl>
        <div class="dd-list dd-do"><p class="dd-head">${TICK}Do</p><p class="dd-text">${esc(w.do)}</p></div>
        ${w.avoid ? `<div class="dd-list dd-dont"><p class="dd-head">${CROSS}Don't</p><p class="dd-text">${esc(w.avoid)}</p></div>` : ''}
        ${link ? `<div class="brief-item-foot"><a class="brief-src" href="${esc(link)}">See the reviewed guide and sources →</a></div>` : ''}
      </li>`;
  }).join('');
  const phrases = (rec.phrases || []).filter(p => p.english && p.local);
  const phrasesHtml = phrases.length ? `<section class="brief-phrases" aria-label="Three phrases to know"><h2 class="brief-phrases-title">Three phrases to know</h2><ul>${phrases.map(p =>
    `<li><span class="ph-en">${esc(p.english)}</span><span class="ph-local">${esc(p.local)}</span>${p.romanization ? `<span class="ph-rom">${esc(p.romanization)}</span>` : ''}</li>`).join('')}</ul><p class="ph-note">Pronunciation is approximate.</p></section>` : '';
  const tripUrl = `/?tf=${encodeURIComponent(page.origin)}&tt=${encodeURIComponent(dest)}&tc=general#/trip`;
  const faqs = (rec.watch_outs || []).slice(0, 3).map(w => ({ q: `${w.title}: what should ${page.demonym} know in ${destThe}?`, a: `${w.to_norm} ${w.do}` }));
  const trail = [{ name: 'Home', url: '/' }, { name: 'Etiquette', url: '/etiquette/' }, { name: `For ${page.demonym}`, url: '/etiquette/' }, { name: dest, url }];
  const jsonld = [
    breadcrumbJsonLd(trail),
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    { '@context': 'https://schema.org', '@type': 'WebPage', url: canonical, name: title, dateModified: rec.grounded },
  ];
  return `${head({ title, description, canonical, jsonld, ogImage: `/og/${page.slug}/${dSlug}.png` })}
${header()}
  <main class="seo-main">
    ${breadcrumbs(trail)}
    <div class="seo-hero">
      <p class="seo-kicker">For ${esc(page.adjective)} travelers</p>
      <h1>${esc(dest)} etiquette for ${esc(page.demonym)}: what's different from home</h1>
      <p class="seo-hero-sub">${esc(rec.headline)}</p>
    </div>
    ${phrasesHtml}
    <ol class="brief-list seo-origin-list">${items}</ol>
    <div class="seo-cta">
      <p>Make it yours: add your dates and plans for a personal briefing you can save for offline use.</p>
      <a class="btn-cta" href="${esc(tripUrl)}">Get my trip briefing →</a>
      ${hasHub ? `<p class="seo-quiz-link"><a href="/etiquette/${dSlug}/">All ${esc(dest)} etiquette guides →</a></p>` : ''}
    </div>
    <div class="result-footnote seo-origin-note">Drafted by AI from our fact-checked country guides and web sources on <time datetime="${esc(rec.grounded)}">${esc(humanDate(rec.grounded))}</time>, and not yet independently reviewed. Customs vary between people and regions.</div>
  </main>
${footer()}`;
}