// Movable-holiday table used by trip briefings.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { holidaysFor, MOVABLE_HOLIDAYS } = await import('../src/_holidays.js');
const { finalizeBrief, briefYear } = await import('../src/_brief.js');
const { isCountry } = await import('../src/_countries.js');

test('every entry is well-formed, sourced over https, and names real countries', () => {
  for (const h of MOVABLE_HOLIDAYS) {
    assert.match(h.from, /^\d{4}-\d{2}-\d{2}$/, h.title);
    assert.ok(h.from <= h.to, h.title + ' range');
    assert.match(h.source.url, /^https:\/\//, h.title);
    for (const c of h.countries) assert.ok(isCountry(c), `${h.title}: ${c}`);
  }
});

test('month overlap: Ramadan 2027 spans February and March in the UAE', () => {
  const titles = (m) => holidaysFor('United Arab Emirates', m, 2027).map((h) => h.title);
  assert.deepEqual(titles(2), ['Ramadan']);
  assert.deepEqual(titles(3), ['Ramadan', 'Eid al-Fitr']);
  assert.deepEqual(titles(5), ['Eid al-Adha']);
  assert.deepEqual(titles(7), []);
});

test('only countries that observe the holiday get it', () => {
  assert.deepEqual(holidaysFor('Japan', 2, 2027), []);
  assert.deepEqual(holidaysFor('South Korea', 9, 2027).map((h) => h.title), ['Chuseok']);
  assert.deepEqual(holidaysFor('Philippines', 3, 2027).map((h) => h.title), ['Holy Week and Easter']);
  assert.deepEqual(holidaysFor('Greece', 5, 2027).map((h) => h.title), ['Orthodox Easter']);
  assert.deepEqual(holidaysFor('India', 11, 2026).map((h) => h.title), ['Diwali']);
  assert.deepEqual(holidaysFor('UAE', 3, 2027), [], 'unknown names never match');
});

test('approximate dates say so; fixed dates are plain', () => {
  const [ramadan] = holidaysFor('Egypt', 2, 2027);
  assert.equal(ramadan.movable, true);
  assert.match(ramadan.note, /Expected around 8 Feb 2027 – 9 Mar 2027; the exact day depends on the moon sighting\./);
  const [lny] = holidaysFor('Vietnam', 2, 2027);
  assert.equal(lny.movable, false);
  assert.match(lny.note, /6 Feb 2027\.$/);
});

test('briefings put verified holidays first and drop the model\'s duplicate', () => {
  const year = briefYear(3);
  const expected = holidaysFor('United Arab Emirates', 3, year).map((h) => h.title);
  const item = { title: 'x', category: 'Dress', context: 'general', severity: 'high', from_norm: 'a', to_norm: 'b', do: 'c', avoid: 'd', gesture_key: '' };
  const sources = [{ title: 'UAE holidays: Ramadan and Mother\'s Day', url: 'https://example.org/uae', content: 'Ramadan and Mother\'s Day in March.' }];
  const out = finalizeBrief({
    headline: 'h', watch_outs: [item, item, item, item, item],
    season: [{ title: 'Ramadan', note: 'Ramadan may fall in or near March.', movable: true, source: 1 },
             { title: "Mother's Day", note: 'Flowers are popular.', movable: false, source: 1 }],
  }, { from: 'Philippines', to: 'United Arab Emirates', contexts: [], month: 3 }, sources);
  const titles = out.season.map((s) => s.title);
  assert.deepEqual(titles.slice(0, expected.length), expected);
  assert.equal(titles.filter((t) => t === 'Ramadan').length, expected.includes('Ramadan') ? 1 : 1);
  assert.ok(titles.includes("Mother's Day"));
});
