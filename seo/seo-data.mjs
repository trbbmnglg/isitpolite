// ── Config + curated query space for programmatic SEO pages ──────────────
// Keep the lists focused on high-intent, frequently-searched combinations.
// Each (gesture × country) pair becomes a static page; each country gets a hub.
// Scale up by adding entries — the build is cache-aware and incremental.

export const BASE_URL  = 'https://isitpolite.com'; // live apex domain
export const SITE_NAME = 'IsItPolite.com';
export const DONATE_URL = 'https://paypal.me/robertbumanglag';

export const GESTURES = [
  { display: 'Tipping at a restaurant',        short: 'Tipping',                     context: 'dining'   },
  { display: 'Thumbs up',                      short: 'Thumbs up',                   context: 'general'  },
  { display: 'Showing the soles of your feet', short: 'Showing soles of feet',       context: 'social'   },
  { display: 'Eating with your left hand',     short: 'Eating with the left hand',   context: 'dining'   },
  { display: 'Patting someone on the head',    short: "Patting someone's head",      context: 'social'   },
  { display: 'Direct eye contact',             short: 'Direct eye contact',          context: 'business' },
  { display: 'Removing your shoes indoors',    short: 'Removing shoes indoors',      context: 'general'  },
  { display: 'Pointing with your index finger',short: 'Pointing with a finger',      context: 'general'  },
  { display: 'Public displays of affection',   short: 'Public displays of affection',context: 'social'   },
  { display: 'Arriving late to a meeting',     short: 'Arriving late',               context: 'business' },
  { display: 'Refusing food offered by a host',short: 'Refusing offered food',       context: 'family'   },
  { display: 'The OK hand sign',               short: 'The OK hand sign',            context: 'general'  },
  { display: 'Slurping your noodles',          short: 'Slurping noodles',            context: 'dining'   },
  { display: 'Kissing on the cheek when greeting', short: 'Cheek-kiss greeting',     context: 'social'   },
  { display: 'Beckoning someone with your finger', short: 'Beckoning with a finger', context: 'general'  },
  { display: 'Giving a gift',                  short: 'Giving a gift',               context: 'business' },
  // Long-tail additions (2026-10-18): generated with sources by scripts/generate-pages.mjs.
  { display: 'Crossing your legs while sitting', short: 'Crossing your legs',        context: 'business' },
  { display: 'Blowing your nose in public',    short: 'Blowing your nose in public', context: 'general'  },
  { display: 'Splitting the bill',             short: 'Splitting the bill',          context: 'dining'   },
  { display: 'Pouring your own drink',         short: 'Pouring your own drink',      context: 'dining'   },
  { display: 'Hugging when greeting',          short: 'Hugging hello',               context: 'social'   },
  { display: 'Exchanging business cards',      short: 'Business cards',              context: 'business' },
  { display: 'Wearing shorts in public',       short: 'Wearing shorts',              context: 'general'  },
  { display: 'Asking someone their age or salary', short: 'Asking age or salary',    context: 'social'   },
];

export const COUNTRIES = [
  'Japan', 'China', 'Thailand', 'India', 'South Korea', 'France',
  'Germany', 'Italy', 'United Arab Emirates', 'Turkey', 'Brazil', 'United States',
  'United Kingdom', 'Spain', 'Mexico', 'Russia', 'Indonesia', 'Vietnam',
  'Philippines', 'Egypt', 'Saudi Arabia', 'Greece', 'Netherlands', 'Singapore',
];

export { CONTEXT_LABELS } from '../src/_countries.js';

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/['"’]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function countrySlug(name) { return slugify(name); }
export function gestureSlug(gesture) { return slugify(gesture.display); }

// Cross product of every gesture × country.
export function allPairs() {
  const out = [];
  for (const country of COUNTRIES) {
    for (const gesture of GESTURES) {
      out.push({ country, countrySlug: countrySlug(country), gesture, gestureSlug: gestureSlug(gesture) });
    }
  }
  return out;
}
