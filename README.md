# IsItPolite.com — AI Cultural Etiquette Checker

Is that gesture polite, rude, or context-dependent **in that country**? IsItPolite.com answers etiquette questions across **195 countries** — grounded in **live web sources**, not just model memory. It also builds country cheat-sheets, scenario quizzes, side-by-side country comparisons, and "from → to" trip culture-diffs, and tracks **community-verified accuracy** for every verdict.

Built edge-native: a single **Cloudflare Worker** serving a static front-end (assets from `dist/`) and running **LangGraph.js** agents (DeepSeek via LangChain's OpenAI-compatible client, grounded with **Tavily** web search) and **Cloudflare D1** for community data. Privacy-first: no accounts, no tracking cookies, no personal data stored (Cloudflare adds cookieless aggregate analytics and bot protection, disclosed in `/privacy`).

🔗 **Live:** https://isitpolite.com

---

## What makes it agentic

Two LangGraph state machines run server-side inside the Worker (`src/_agent.js`).

**1. Lookup agent** — Check / Compare / Trip / Guide / Quiz. Retrieval-augmented and self-correcting:

```
retrieve (Tavily) → generate (grounded LLM) → reflect (validate)
                          ▲                          │
                          └──── invalid? regenerate ◄┤  (max 2 attempts)
                                                     ▼
                                             valid → END
```

**2. Report adjudication agent** — vets community inaccuracy reports before they can move a verdict:

```
START → screen (moderation) ──troll / off-topic──► decide (reject, store nothing)
              │
              ▼
        corroborate (Tavily + cultural fact-check) → decide
                                                       │
                  legit + corroborated + ≥3 independent reports ──► accuracy moves
```

A lone report — or a troll that slips the moderation filter — **never** flips a verdict; accuracy only changes after independent corroboration. Accepted reports and feedback are AI-sanitized (PII stripped) and emailed to the owner via Resend.

---

## Architecture

| Layer | Tech | File |
| --- | --- | --- |
| Front-end SPA | Vanilla HTML/CSS/JS, "Travel journal" design system, hash-routed views, custom combobox | `index.html` · `src/js/` · `src/css/` (bundled by `build-seo.mjs` into `dist/app.js` and `dist/style.css`) |
| Lookup + report agents | LangGraph.js (`@langchain/langgraph`) | `src/_agent.js` |
| LLM | DeepSeek via LangChain `ChatOpenAI` (OpenAI-compatible) | `src/_agent.js` |
| Web-search grounding | Tavily REST (`/search`) via `fetch` | `src/_agent.js` |
| Lookup endpoint | `POST /api/lookup` (mode-based) | `src/api/lookup.js` |
| Reports / feedback / accuracy / community | Worker routes + D1 | `src/api/*.js` |
| Community DB | Cloudflare D1 (SQLite) — verdicts, reports, feedback (PII-free by design) | `schema.sql` |
| Rate limiting | D1 fixed-window, salted-hash of IP (never stored) | `src/_shared.js` |
| Email | Resend REST (owner notifications) | `src/_shared.js` |
| Programmatic SEO | Build script → static `/etiquette/**` pages + sitemap | `build-seo.mjs` · `seo/` |
| Offline / install | Service worker (network-first) + PWA manifest | `sw.js` · `manifest.json` |

### API surface

| Method | Route | What it does |
| --- | --- | --- |
| POST | `/api/lookup` | Retrieval-augmented verdict / guide / quiz / compare / trip (`{ mode, ...params }`) |
| POST | `/api/report` | Confirm a verdict or submit an inaccuracy report (agent-vetted, corroborated) |
| POST | `/api/feedback` | Anonymous feedback (AI-sanitized, emailed to owner) |
| GET | `/api/accuracy` | Community accuracy for one verdict |
| GET | `/api/community` | Aggregate community accuracy stats |
| GET | `/api/stats` | Public usage counter: `{ total, last30Days, byMode, since }` (answered checks only, counted on isitpolite.com, stores only day + mode) |

---

## Privacy

No accounts, no tracking cookies, no IP storage, no personal data. The usage counter stores only a UTC day and a mode name. Free-text inputs are blocked client-side for obvious PII (email / phone / card / ID) and AI-stripped server-side; only anonymized summaries are ever stored. See [`/privacy`](https://isitpolite.com/privacy). Designed to align with **GDPR** and **ISO/IEC 27701/27001** principles — alignment, not a certification claim.

---

## Setup & deploy

```bash
npm install                        # LangGraph + LangChain deps (bundled into the Worker)

# Set secrets (wrangler secret put <NAME>, or the Cloudflare dashboard → Workers → Settings):
#   DEEPSEEK_API_KEY    TAVILY_API_KEY    RESEND_API_KEY
npx wrangler d1 execute isitpolite-db --remote --file=schema.sql                      # fresh DB only\nnpx wrangler d1 execute isitpolite-db --remote --file=migrations/0001_usage_daily.sql # existing DB: usage counter table

node build-seo.mjs                 # assemble ./dist (app shell + SEO pages + sitemap) from ./seo-cache
npx wrangler deploy                # Worker + static assets
```

`wrangler.toml` sets `main = "src/worker.js"`, `[assets] directory = "./dist"`, `compatibility_flags = ["nodejs_compat"]` (LangChain needs `node:async_hooks`), and the D1 binding. Run `npm test` before deploying. Programmatic-SEO details are in `SEO-README.md`.

---

## Stack

Cloudflare Workers · D1 · LangGraph.js · LangChain · DeepSeek · Tavily · Resend
