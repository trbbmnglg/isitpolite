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

test('check output stays valid with or without home_contrast', () => {
  const ok = { verdict: 'caution', explanation: 'x', also_check: [] };
  assert.equal(!!LOOKUP_MODES.check.valid(ok), true);
  assert.equal(!!LOOKUP_MODES.check.valid({ ...ok, home_contrast: 'In the Philippines tipping is common.' }), true);
});
