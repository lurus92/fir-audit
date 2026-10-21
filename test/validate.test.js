import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleVerdicts, agreement } from '../src/validate.js';

const rep = (site, verdicts) => ({ site, results: verdicts.map((f, i) => ({ id: `t${i}`, task: `task ${i}`, candidates: ['https://x/p'], fulfilled: f, confidence: 0.9, reason: '' })) });

test('sample is balanced, excludes no-page failures, and is reproducible', () => {
  const reports = [rep('https://a.test', [true, true, true, false, false, false]), rep('https://b.test', [true, false, false, false])];
  reports[1].results.push({ id: 'nopage', task: 'x', candidates: [], fulfilled: false, confidence: 1 });
  const s1 = sampleVerdicts(reports, 6);
  const s2 = sampleVerdicts(reports, 6);
  assert.equal(s1.length, 6);
  assert.equal(s1.filter((r) => r.judge === 'pass').length, 3);
  assert.ok(!s1.some((r) => r.task_id === 'nopage'));
  assert.deepEqual(s1, s2);
});

test('agreement and kappa', () => {
  const rows = [
    { judge: 'pass', human: 'pass' }, { judge: 'pass', human: 'pass' }, { judge: 'pass', human: 'fail' },
    { judge: 'fail', human: 'fail' }, { judge: 'fail', human: 'fail' }, { judge: 'fail', human: 'Pass' },
    { judge: 'fail', human: '' },
  ];
  const a = agreement(rows);
  assert.equal(a.total, 6);
  assert.equal(a.agreement, 4 / 6);
  assert.equal(a.false_pass, 1);
  assert.equal(a.false_fail, 1);
  assert.ok(Math.abs(a.kappa - 1 / 3) < 1e-9);
});
