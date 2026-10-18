# Programmatic SEO pages

Pre-rendered, crawlable static pages so the site **ranks in Google** for long-tail
queries like *"is tipping rude in Japan"* — the content is baked into the HTML
(not JS-rendered), with per-page `<title>`, meta description, canonical, Open Graph,
and `FAQPage` + `BreadcrumbList` JSON-LD.

## URLs generated

| URL | Page |
|-----|------|
| `/etiquette/` | Index — all countries |
| `/etiquette/{country}/` | Country hub (links to every gesture, ranks for "{country} etiquette") |
| `/etiquette/{country}/{gesture}/` | The money pages — "is {gesture} polite in {country}?" |

All are added to `sitemap.xml`, linked from each other (internal linking), and
linked from the homepage footer. Each page also links back into the live app
with the query pre-filled (`/?g=…&c=…&ctx=…`).

## How it works

- `seo/seo-data.mjs` — the curated `GESTURES` × `COUNTRIES` lists (edit to scale up).
- `seo/template.mjs` — the HTML templates (reuse `/style.css`).
- `build-seo.mjs` — generates content via DeepSeek, **caches each result in `seo-cache/`**
  (so re-runs are incremental and free), renders pages, and assembles a clean
  **`dist/`** containing only public assets + the bundled `app.js` / `style.css` + the generated pages + `sitemap.xml`. The Worker code lives in `src/` and is deployed by Wrangler, not copied into `dist/`.

`dist/` is what gets deployed. Build tooling and `seo-cache/` never ship.

## Adding new pages (sourced by construction)

Add gestures to `GESTURES` in `seo/seo-data.mjs`, then generate the missing pairs with the
same grounded pipeline as live Check (web search → draft → validate):

```powershell
node scripts/generate-pages.mjs --dry       # list missing pairs
node scripts/generate-pages.mjs --limit 10  # generate a few and read them first
node scripts/generate-pages.mjs             # fill the rest
```

Keys come from `.dev.vars` (`DEEPSEEK_API_KEY`, `TAVILY_API_KEY`). A page is written only
if the answer cites at least one non-forum source; Reddit/Facebook/Quora-style links are
kept as "traveler discussions" but never carry a page alone. Generated records carry
`grounded: <date>` (not `reviewed`), and the page says it is "not yet independently reviewed"
until a fact-check pass adds `reviewed`.

## Build & deploy

```powershell
# 1. assemble dist from seo-cache (no key needed; never generates pages from model memory
#    unless DEEPSEEK_API_KEY is set — prefer scripts/generate-pages.mjs for new pages)
node build-seo.mjs

# 2. test, then deploy the Worker (serves dist/ as static assets)
npm test
npx wrangler deploy
```

Useful flags:

```powershell
node build-seo.mjs --sample      # no API — renders built-in sample pages (for testing; never written to seo-cache/)
node build-seo.mjs --limit 20    # only make 20 new API calls this run (cost control / resume)
```

Re-running without the key (`node build-seo.mjs`) just re-assembles `dist/` from the
existing `seo-cache/` — handy when you only changed the app shell or a template.

## After deploying

1. In **Google Search Console**, add the `isitpolite.com` property and submit
   `https://isitpolite.com/sitemap.xml`.
2. `BASE_URL` in `seo/seo-data.mjs` is set to the live apex domain `https://isitpolite.com`.
   If the domain ever changes, update it there, rebuild, redeploy, and resubmit the sitemap.

## Cost

`deepseek-chat`, ~800 output tokens/page. A full 144-page run is well under US$0.50,
and it's cached — you only pay again for pages you add.
