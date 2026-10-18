// Temporary asset redirects become permanent (301) for search engines.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { permanentRedirect } = await import('../src/worker.js');

const reqFor = (path, method = 'GET') => {
  const url = new URL('https://isitpolite.com' + path);
  return { request: new Request(url, { method }), url };
};
const assetRes = (status, location) => new Response(null, { status, headers: location ? { Location: location } : {} });

test('same-site 307s from static assets become 301s with an absolute Location', () => {
  const { request, url } = reqFor('/etiquette/japan/tipping-at-a-restaurant');
  const res = permanentRedirect(request, url, assetRes(307, '/etiquette/japan/tipping-at-a-restaurant/'));
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('Location'), 'https://isitpolite.com/etiquette/japan/tipping-at-a-restaurant/');

  const idx = reqFor('/index.html');
  assert.equal(permanentRedirect(idx.request, idx.url, assetRes(307, '/')).headers.get('Location'), 'https://isitpolite.com/');
});

test('everything else passes through unchanged', () => {
  const { request, url } = reqFor('/etiquette/japan/');
  const ok = assetRes(200);
  assert.equal(permanentRedirect(request, url, ok), ok);
  const offsite = assetRes(307, 'https://example.com/x');
  assert.equal(permanentRedirect(request, url, offsite).status, 307);
  const post = reqFor('/x', 'POST');
  assert.equal(permanentRedirect(post.request, post.url, assetRes(307, '/x/')).status, 307);
  assert.equal(permanentRedirect(request, url, assetRes(307)).status, 307);
});

// Regression (2026-10-18): adding run_worker_first without /api/* sent every API
// call to the 404 page for ~2 hours, because not_found_handling answers unlisted paths.
test('wrangler.toml routes /api/* to the Worker first', async () => {
  const { readFileSync } = await import('node:fs');
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const line = toml.split('\n').find((l) => /^\s*run_worker_first\s*=/.test(l));
  assert.ok(line, 'run_worker_first is set');
  assert.ok(line.includes('"/api/*"'), 'run_worker_first must include "/api/*"');
});
