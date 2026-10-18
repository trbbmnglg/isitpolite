// Light/dark toggle: CSS expansion and page snippets.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { expandDarkMode, injectTheme, THEME_KEY } = await import('../seo/theme.mjs');

test('dark blocks are emitted for the system setting (unless forced light) and for forced dark', () => {
  const css = 'a{color:red}\n@media (prefers-color-scheme: dark) {\n  :root { --ink: #fff; }\n  select, .x { background: url("data:image/svg+xml,%3Csvg%3E"); }\n}\nb{color:blue}';
  const out = expandDarkMode(css);
  assert.match(out, /@media \(prefers-color-scheme: dark\) \{[\s\S]*:root:not\(\[data-theme="light"\]\) \{ --ink: #fff; \}/);
  assert.match(out, /:root:not\(\[data-theme="light"\]\) select, :root:not\(\[data-theme="light"\]\) \.x \{/);
  assert.match(out, /\n:root\[data-theme="dark"\] \{ --ink: #fff; \}/);
  assert.match(out, /:root\[data-theme="dark"\] select, :root\[data-theme="dark"\] \.x \{ background: url\("data:image\/svg\+xml,%3Csvg%3E"\); \}/);
  assert.ok(out.startsWith('a{color:red}') && out.trim().endsWith('b{color:blue}'), 'other rules untouched');
  assert.equal((out.match(/\{/g) || []).length, (out.match(/\}/g) || []).length, 'braces balanced');
});

test('static pages get the head script, the button and the toggle script from markers', () => {
  const html = injectTheme('<head><!--theme-head--></head><body><!--theme-button--><!--theme-script--></body>');
  assert.match(html, new RegExp(`localStorage.getItem\\('${THEME_KEY}'\\)`));
  assert.match(html, /class="theme-toggle"/);
  assert.match(html, /addEventListener\('click'/);
  assert.doesNotMatch(html, /<!--theme-/);
});
