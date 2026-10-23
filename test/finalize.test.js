import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHumanVerdicts } from '../src/finalize.js';

test('human verdicts override the judge and are recorded', () => {
  const rep = { site: 'https://www.shop.ch/', access: { status: 'ok' }, crawl: {}, summary: {}, results: [
    { id: 'a', fulfilled: false, confidence: 0.9, candidates: ['x'] },
    { id: 'b', fulfilled: false, confidence: 0.9, candidates: ['x'] },
    { id: 'c', fulfilled: true, confidence: 1, candidates: ['x'] },
  ] };
  const [out] = applyHumanVerdicts([rep], [
    { site: 'shop.ch', task_id: 'a', human: 'pass', note: 'on the FAQ' },
    { site: 'shop.ch', task_id: 'b', human: 'fail' },
  ]);
  assert.equal(out.summary.failed, 1);
  assert.equal(out.results[0].decided_by, 'human');
  assert.equal(out.results[0].judge_pass, false);
  assert.equal(out.results[2].decided_by, 'judge');
  assert.deepEqual(out.verification, { human_checked: 2, failures_human_confirmed: 1, failures_total: 1 });
});
