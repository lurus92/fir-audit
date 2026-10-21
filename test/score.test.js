import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failedIntentRate } from '../src/score.js';

test('counts unfulfilled and low-confidence intents as failed', () => {
  const s = failedIntentRate([
    { intent: 'Support', fulfilled: true, confidence: 0.9 },
    { intent: 'Support', fulfilled: true, confidence: 0.4 },
    { intent: 'Pricing', fulfilled: false, confidence: 0.95 },
    { intent: 'Pricing', fulfilled: true, confidence: 0.8 },
  ], 0.6);
  assert.equal(s.total, 4);
  assert.equal(s.failed, 2);
  assert.equal(s.fir, 0.5);
  assert.deepEqual(s.byIntent.Support, { total: 2, failed: 1, fir: 0.5 });
});

test('empty input gives 0, not NaN', () => {
  assert.equal(failedIntentRate([]).fir, 0);
});
