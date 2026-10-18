// Trip briefing: prompt, validation and the trust rules applied in finalize.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const { briefMode, finalizeBrief, briefYear } = await import('../src/_brief.js');
const { REVIEWED } = await import('../src/_reviewed.js');

const mode = briefMode((src) => (src ? '\nSOURCES\n' + src : ''));
const P = { from: 'Philippines', to: 'Japan', contexts: ['dining', 'business'], month: 0 };
const item = (o = {}) => ({ title: 'Do not tip', category: 'Tipping', context: 'dining', severity: 'high', from_norm: 'a', to_norm: 'b', do: 'Pay the bill', avoid: 'Leaving cash', gesture_key: '', ...o });
const draft = (o = {}) => ({ headline: 'Quieter and more formal.', watch_outs: [item(), item(), item(), item(), item()], season: [], ...o });

test('briefYear picks the next occurrence of the month', () => {
  const oct = new Date(Date.UTC(2026, 9, 18));
  assert.equal(briefYear(10, oct), 2026);
  assert.equal(briefYear(12, oct), 2026);
  assert.equal(briefYear(3, oct), 2027);
});

test('prompt is from the traveler’s perspective and includes reviewed facts', () => {
  const prompt = mode.prompt(P, '');
  assert.match(prompt, /traveler from Philippines who is going to Japan/);
  assert.match(prompt, /Dining \/ restaurant, Business \/ work/);
  if (REVIEWED.Japan) assert.match(prompt, /Reviewed facts for Japan/);
  assert.match(prompt, /Set "season" to an empty array/);
  assert.match(mode.prompt({ ...P, month: 3 }, ''), /may fall in or near March/);
});

test('queries add a holiday search only when a month is given', () => {
  assert.equal(mode.query(P).length, 2);
  const q = mode.query({ ...P, month: 4 });
  assert.equal(q.length, 3);
  assert.match(q[2], /Japan public holidays festivals April \d{4}/);
});

test('validator needs a headline and at least 5 complete watch-outs', () => {
  assert.equal(mode.valid(draft()), true);
  assert.equal(mode.valid(draft({ headline: '' })), false);
  assert.equal(mode.valid(draft({ watch_outs: [item(), item()] })), false);
  assert.equal(mode.valid(draft({ watch_outs: [item(), item(), item(), item(), item({ severity: 'extreme' })] })), false);
});

test('finalize sorts by severity and only links reviewed pages', () => {
  const reviewedKey = REVIEWED.Japan && REVIEWED.Japan.items[0].key;
  const out = finalizeBrief(draft({
    watch_outs: [item({ severity: 'low' }), item({ severity: 'high', gesture_key: reviewedKey || '' }), item({ severity: 'medium', gesture_key: 'made-up-key' }), item(), item()],
  }), P, []);
  assert.deepEqual(out.watch_outs.map((w) => w.severity), ['high', 'high', 'high', 'medium', 'low']);
  assert.equal(out.watch_outs.find((w) => w.severity === 'medium').link, '', 'unknown keys never link');
  if (reviewedKey) assert.ok(out.watch_outs.some((w) => w.link === '/etiquette/japan/' + reviewedKey + '/'));
  assert.equal(finalizeBrief(draft({ watch_outs: [item({ gesture_key: 'thumbs-up' }), item(), item(), item(), item()] }), { ...P, to: 'Iceland' }, []).watch_outs[0].link, '', 'no reviewed data, no link');
});

test('season notes need a real source, and movable holidays never get exact dates', () => {
  const sources = [
    { title: 'Spring in Japan', url: 'https://example.org/h', content: 'Cherry blossom viewing peaks in spring. Ramadan dates vary.' },
    { title: 'Insecure', url: 'http://example.org/x', content: 'Golden Week' },
    { title: 'Japanese etiquette tips', url: 'https://example.org/e', content: 'Bow and do not tip.' },
  ];
  const out = finalizeBrief(draft({
    season: [
      { title: 'Cherry blossom', note: 'Parks are busy.', movable: false, source: 1 },
      { title: 'No source', note: 'Something.', movable: false, source: 0 },
      { title: 'Golden Week', note: 'Something.', movable: false, source: 2 },
      { title: 'Thanksgiving', note: 'Busy travel.', movable: false, source: 3 },
      { title: 'Ramadan', note: 'Ramadan starts on March 3rd.', movable: true, source: 1 },
      { title: 'Ramadan', note: 'Ramadan may fall in late March.', movable: true, source: 1 },
      { title: 'Ramadan', note: 'Ramadan may fall in or near March.', movable: true, source: 1 },
    ],
  }), { ...P, month: 3 }, sources);
  assert.deepEqual(out.season.map((s) => s.title), ['Cherry blossom', 'Ramadan']);
  assert.match(out.season[1].note, /may fall in or near/);
  assert.equal(out.season[0].source.url, 'https://example.org/h');
  assert.equal(out.year > 2000, true);
  assert.deepEqual(finalizeBrief(draft({ season: [{ title: 'x', note: 'y', source: 1 }] }), P, sources).season, [], 'no month, no season');
});
