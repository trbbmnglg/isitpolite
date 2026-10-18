import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWebhook, captureIdOf } from '../src/api/paypal-webhook.js';
import { signQuiz, scoreQuiz, quizPassed } from '../src/_quiztoken.js';

const completed = (amount, custom) => ({
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: { id: 'CAP123', custom_id: custom || 't1', amount: { value: amount || '10.00', currency_code: 'USD' } },
});

test('webhook: completed capture activates a pending code, leaves an active one alone', () => {
  assert.deepEqual(planWebhook(completed(), { code: 'X', status: 'pending' }), { action: 'activate' });
  assert.deepEqual(planWebhook(completed(), { code: 'X', status: 'active' }), { action: 'none' });
  assert.deepEqual(planWebhook(completed(), { code: 'X', status: 'revoked' }), { action: 'none' });
});

test('webhook: mints only for a known tier paid in full', () => {
  assert.equal(planWebhook(completed(), null).action, 'mint');
  assert.equal(planWebhook(completed(), null).tier.id, 't1');
  assert.deepEqual(planWebhook(completed('1.00'), null), { action: 'none', reason: 'amount_mismatch' });
  assert.deepEqual(planWebhook(completed('10.00', 'bogus'), null), { action: 'none' });
});

test('webhook: denied, reversed and refunded captures revoke the code', () => {
  for (const t of ['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.REVERSED', 'PAYMENT.CAPTURE.REFUNDED']) {
    assert.deepEqual(planWebhook({ event_type: t, resource: {} }, { status: 'active' }), { action: 'revoke' });
    assert.deepEqual(planWebhook({ event_type: t, resource: {} }, null), { action: 'none' });
  }
  assert.deepEqual(planWebhook({ event_type: 'CHECKOUT.ORDER.APPROVED', resource: {} }, null), { action: 'none' });
});

test('webhook: refund events resolve the capture id from the "up" link', () => {
  assert.equal(captureIdOf(completed()), 'CAP123');
  assert.equal(captureIdOf({
    event_type: 'PAYMENT.CAPTURE.REFUNDED',
    resource: { id: 'REFUND9', links: [{ rel: 'self', href: 'https://api.paypal.com/v2/payments/refunds/REFUND9' }, { rel: 'up', href: 'https://api.paypal.com/v2/payments/captures/CAP777' }] },
  }), 'CAP777');
  assert.equal(captureIdOf({ event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'REFUND9' } }), '');
});

const env = { QUIZ_SECRET: 'test-secret' };
const questions = [0, 1, 2, 3, 0].map((c) => ({ question: 'q', options: ['a', 'b', 'c', 'd'], correct: c }));

test('quiz token: server re-scores against the signed key', async () => {
  const token = await signQuiz(env, 'Japan', questions);
  assert.ok(token.includes('.'));
  assert.deepEqual(await scoreQuiz(env, token, [0, 1, 2, 3, 0]), { country: 'Japan', score: 5, total: 5 });
  const four = await scoreQuiz(env, token, [0, 1, 2, 3, 1]);
  assert.equal(four.score, 4);
  assert.equal(quizPassed(four), true);
  assert.equal(quizPassed(await scoreQuiz(env, token, [0, 1, 2, 0, 1])), false);
  assert.equal(await scoreQuiz(env, token, [0, 1, 2]), null); // wrong length
});

test('quiz token: tampering, wrong secret, expiry and missing secret are all refused', async () => {
  const token = await signQuiz(env, 'Japan', questions);
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ c: 'France', k: [0, 0, 0, 0, 0], e: Date.now() + 1e6 })).toString('base64url');
  assert.equal(await scoreQuiz(env, forged + '.' + sig, [0, 0, 0, 0, 0]), null);
  assert.equal(await scoreQuiz({ QUIZ_SECRET: 'other' }, token, [0, 1, 2, 3, 0]), null);
  assert.equal(await scoreQuiz(env, body + '.' + sig + 'x', [0, 1, 2, 3, 0]), null);
  assert.equal(await scoreQuiz(env, token, [0, 1, 2, 3, 0], Date.now() + 25 * 3600 * 1000), null);
  assert.equal(await scoreQuiz(env, 'garbage', [0]), null);
  assert.equal(await signQuiz({}, 'Japan', questions), '');
  assert.equal(await scoreQuiz({}, token, [0, 1, 2, 3, 0]), null);
});
