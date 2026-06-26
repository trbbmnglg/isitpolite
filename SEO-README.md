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
  **`dist/`** containing only public assets + `functions/` + the generated pages + `sitemap.xml`.

`dist/` is what gets deployed. Build tooling and `seo-cache/` never ship.

## Build & deploy

```powershell
# 1. set your DeepSeek key for this shell (only needed to generate NEW pages)
$env:DEEPSEEK_API_KEY = "sk-..."

# 2. generate + assemble dist  (first full run ≈ 144 API calls, a few minutes)
node build-seo.mjs

# 3. deploy the assembled folder
npx wrangler pages deploy dist --project-name isitpolite --branch main
```

Useful flags:

```powershell
node build-seo.mjs --sample      # no API — renders 3 built-in sample pages (for testing)
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
