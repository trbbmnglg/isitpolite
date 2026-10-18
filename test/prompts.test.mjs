// Prompt construction for origin-aware lookups (no LLM call is made).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { LOOKUP_MODES } = await import('../src/_agent.js');

test('check prompt asks for home_contrast only when a home country is set', () => {
  const base = { gesture: 'Tipping', country: 'Japan', context: 'dining' };
  const withHome = LOOKUP_MODES.check.prompt({ ...base, home: 'Philippines' }, '');
  assert.match(withHome, /traveler is from Philippines/);
  assert.match(withHome, /"home_contrast"/);

  const without = LOOKUP_MODES.check.prompt({ ...base, home: '' }, '');
  assert.doesNotMatch(without, /home_contrast/);
  assert.doesNotMatch(without, /traveler is from/);
});

test('check prompt defines confidence levels and asks for cited sources', () => {
  const prompt = LOOKUP_MODES.check.prompt({ gesture: 'Tipping', country: 'Japan', context: 'dining', home: '' }, '[1] Source: text');
  assert.match(prompt, /"low" = sources are thin or disagree/);
  assert.match(prompt, /In "cited", list the numbers/);
});

test('check finalize turns cited numbers into real https sources only', () => {
  const sources = [
    { title: 'A', url: 'https://a.example/x', content: '' },
    { title: 'B', url: 'http://b.example/x', content: '' },
    { title: 'C', url: 'https://c.example/x', content: '' },
  ];
  const out = LOOKUP_MODES.check.finalize({ verdict: 'polite', explanation: 'x', also_check: [], cited: [1, 2, 3, 3, 9, 'nope'] }, {}, sources);
  assert.deepEqual(out.sources, [{ title: 'A', url: 'https://a.example/x', kind: 'reference' }, { title: 'C', url: 'https://c.example/x', kind: 'reference' }]);
  const forum = LOOKUP_MODES.check.finalize({ verdict: 'polite', explanation: 'x', also_check: [], cited: [1] }, {}, [{ title: 'r', url: 'https://www.reddit.com/r/japan/x', content: '' }]);
  assert.equal(forum.sources[0].kind, 'community');
  assert.equal('cited' in out, false);
  assert.equal(out.forum_only, undefined);
  assert.deepEqual(LOOKUP_MODES.check.finalize({ verdict: 'polite', explanation: 'x', also_check: [] }, {}, sources).sources, []);
});

test('forum-only or unsourced answers are capped below high confidence', () => {
  const reddit = [{ title: 'r', url: 'https://www.reddit.com/r/japan/x', content: '' }];
  const forum = LOOKUP_MODES.check.finalize({ verdict: 'polite', confidence: 'high', explanation: 'x [1].', also_check: [], cited: [1] }, {}, reddit);
  assert.equal(forum.confidence, 'medium');
  assert.equal(forum.forum_only, true);
  const none = LOOKUP_MODES.check.finalize({ verdict: 'polite', confidence: 'high', explanation: 'x', also_check: [], cited: [] }, {}, reddit);
  assert.equal(none.confidence, 'medium');
  assert.equal(none.forum_only, undefined);
  const mixed = LOOKUP_MODES.check.finalize({ verdict: 'polite', confidence: 'high', explanation: 'x [1] [2].', also_check: [], cited: [1, 2] },
    {}, reddit.concat([{ title: 'g', url: 'https://www.japan.travel/en/guide/x', content: '' }]));
  assert.equal(mixed.confidence, 'high');
  const low = LOOKUP_MODES.check.finalize({ verdict: 'polite', confidence: 'low', explanation: 'x', also_check: [] }, {}, []);
  assert.equal(low.confidence, 'low');
});

test('citation markers are renumbered to the final source list; unknown ones are dropped', () => {
  const sources = [
    { title: 'A', url: 'https://a.example/x', content: '' },
    { title: 'B', url: 'http://b.example/x', content: '' },
    { title: 'C', url: 'https://c.example/x', content: '' },
  ];
  const out = LOOKUP_MODES.check.finalize({ verdict: 'rude', also_check: [], cited: [], explanation: 'First claim [3]. Second claim [1]. Insecure [2]. Repeat [3] [3]. Ghost [7].' }, {}, sources);
  assert.deepEqual(out.sources.map((s) => s.title), ['C', 'A']);
  assert.equal(out.explanation, 'First claim [1]. Second claim [2]. Insecure. Repeat [1]. Ghost.');
});

test('shared labels drive the prompt and cover every verdict and confidence level', async () => {
  const { VERDICT_LEGEND, CONFIDENCE_LEGEND, confidenceRules } = await import('../src/_labels.js');
  assert.deepEqual(VERDICT_LEGEND.map((l) => l.key), ['polite', 'caution', 'rude']);
  assert.deepEqual(CONFIDENCE_LEGEND.map((l) => l.key), ['high', 'medium', 'low']);
  const prompt = LOOKUP_MODES.check.prompt({ gesture: 'x', country: 'Japan', context: 'general', home: '' }, '[1] s');
  assert.ok(prompt.includes(confidenceRules()));
  assert.match(prompt, /square brackets right after each sentence/);
});

test('check output stays valid with or without home_contrast', () => {
  const ok = { verdict: 'caution', explanation: 'x', also_check: [] };
  assert.equal(!!LOOKUP_MODES.check.valid(ok), true);
  assert.equal(!!LOOKUP_MODES.check.valid({ ...ok, home_contrast: 'In the Philippines tipping is common.' }), true);
});
