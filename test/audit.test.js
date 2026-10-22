import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audit } from '../src/audit.js';
import { fakeSite } from './helpers.js';

const pages = {
  '/robots.txt': '',
  '/': '<title>Shop</title><a href="/help/returns">Returns</a>',
  '/help/returns': '<title>Returns</title><p>Return any item within 30 days for a full refund. Weitere Informationen zu Fristen, Kosten und Ablauf findest du in unseren Servicebedingungen. Weitere Informationen zu Fristen, Kosten und Ablauf findest du in unseren Servicebedingungen. Weitere Informationen zu Fristen, Kosten und Ablauf findest du in unseren Servicebedingungen.</p>',
};

test('end to end: crawl, judge with a stubbed LLM, score', async () => {
  const site = fakeSite(pages);
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/chat/completions')) {
      const asksReturns = JSON.parse(init.body).messages[1].content.includes('return');
      const verdict = asksReturns
        ? { fulfilled: true, confidence: 0.9, evidence_url: 'https://shop.test/help/returns', evidence_quote: 'within 30 days for a full refund', answer: '30 days', reason: 'Policy states 30 days.' }
        : { fulfilled: false, confidence: 0.8, evidence_url: null, answer: '', reason: 'Not found.' };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(verdict) } }] }) };
    }
    return site.fetchImpl(url, init);
  };
  const tasks = [
    { id: 'returns', task: 'What is the return policy?', intent: 'Support', keywords: ['return'] },
    { id: 'stores', task: 'Where are your physical stores?', intent: 'General', keywords: ['stores'] },
  ];
  const report = await audit('https://shop.test/', tasks, { delayMs: 0, minPages: 1, minServicePages: 1, fetchImpl, llm: { apiKey: 'test' } });
  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.fir, 0.5);
  assert.equal(report.results.find((r) => r.id === 'stores').reason, 'No crawled page matched this task.');
});

test('a site that blocks the crawler is reported as blocked, never scored', async () => {
  let llmCalled = false;
  const fetchImpl = async (url) => {
    if (String(url).includes('/chat/completions')) llmCalled = true;
    return { ok: false, status: 403, headers: { get: () => 'text/html' }, text: async () => 'Access denied' };
  };
  const tasks = [{ id: 'returns', task: 'What is the return policy?', intent: 'Support', keywords: [] }];
  const report = await audit('https://blocked.test/', tasks, { delayMs: 0, fetchImpl, llm: { apiKey: 'test' } });
  assert.equal(report.access.status, 'blocked');
  assert.match(report.access.reason, /403/);
  assert.equal(report.summary, null);
  assert.equal(llmCalled, false);
});

test('a crawl too thin to judge is marked insufficient and never scored', async () => {
  let llmCalled = false;
  const site = fakeSite(pages);
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/chat/completions')) llmCalled = true;
    return site.fetchImpl(url, init);
  };
  const report = await audit('https://shop.test/', [{ id: 'r', task: 'return policy', intent: 'Support', keywords: [] }], { delayMs: 0, fetchImpl, llm: { apiKey: 'test' } });
  assert.equal(report.access.status, 'insufficient');
  assert.equal(report.summary, null);
  assert.equal(llmCalled, false);
});

test('a crawl that reaches no help or policy page is not scored', async () => {
  const site = fakeSite({ '/robots.txt': '', '/': '<title>Home</title><a href="/stories/run">Run</a>', '/stories/run': '<title>Running stories</title>' });
  let llmCalled = false;
  const fetchImpl = async (url, init) => { if (String(url).includes('/chat/completions')) llmCalled = true; return site.fetchImpl(url, init); };
  const report = await audit('https://shop.test/', [{ id: 'r', task: 'return policy', intent: 'Support', keywords: [] }], { delayMs: 0, minPages: 1, fetchImpl, llm: { apiKey: 'test' } });
  assert.equal(report.access.status, 'no-help-content');
  assert.equal(llmCalled, false);
});
