import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEmail } from '../src/outreach.js';

const template = JSON.parse(readFileSync('templates/outreach-en.json', 'utf8'));
const base = { site: 'https://www.shop.ch/', auditedAt: '2026-10-22T15:00:00.000Z', crawl: { servicePages: ['a', 'b', 'c', 'd', 'e', 'f'] } };
const ok = (id) => ({ id, task: id, fulfilled: true, confidence: 1 });
const fail = (id) => ({ id, task: id, fulfilled: false, confidence: 0.9 });

test('readable shop: counts, failure lines, notes override, no placeholders left except first_name', () => {
  const report = { ...base, access: { status: 'ok' }, results: [ok('returns-window'), fail('track-order'), fail('payment-methods')] };
  const e = buildEmail(report, { template, shopName: 'Shop', notes: [{ site: 'shop.ch', task_id: 'payment-methods', missing: 'the terms name no methods.' }] });
  assert.equal(e.state, 'readable');
  assert.match(e.subject, /1 of 3/);
  assert.match(e.body, /Order tracking: we found no page explaining how a customer tracks/);
  assert.match(e.body, /Payment methods: the terms name no methods\./);
  assert.deepEqual(e.body.match(/\{\{\w+\}\}/g), ['{{first_name}}']);
});

test('blocked shop: robots.txt welcome vs firewall, and varied runs', () => {
  const report = { ...base, access: { status: 'blocked', reason: '403 text/html' }, results: [] };
  const access = [
    { url: 'https://www.shop.ch', crawler: 'blocked', robots: '200', 'ChatGPT-User': 'allowed', 'Claude-User': 'allowed', 'Perplexity-User': 'allowed' },
    { url: 'https://www.shop.ch', crawler: 'ok', robots: '200', 'ChatGPT-User': 'allowed', 'Claude-User': 'allowed', 'Perplexity-User': 'allowed' },
  ];
  const e = buildEmail(report, { template, shopName: 'Shop', accessRows: access });
  // audit run blocked + 1 of 2 access checks blocked = 2 of 3: majority, so blocked
  assert.equal(e.state, 'blocked');
  assert.match(e.body, /HTTP 403/);
  assert.match(e.body, /welcomes AI agents in robots\.txt but refuses them at the firewall/);
  const access2 = access.map((a) => ({ ...a, crawler: 'ok' }));
  const v = buildEmail(report, { template, shopName: 'Shop', accessRows: access2, accessDates: ['2026-10-21T12:00:00.000Z', '2026-10-23T12:00:00.000Z'] });
  assert.equal(v.state, 'blocked-varied');
  assert.match(v.body, /in 1 of 3 checks between 21 October 2026 and 23 October 2026/);
  assert.doesNotMatch(v.body, /\{\{(?!first_name)\w+\}\}/);
});

test('every access state has a variant', () => {
  for (const status of ['ok', 'blocked', 'no-help-content', 'low-coverage', 'unreachable']) {
    // blocked with no repeat checks stays 'blocked'
    const e = buildEmail({ ...base, access: { status, reason: 'timeout' }, results: [] }, { template, shopName: 'Shop' });
    assert.ok(e.subject.includes('Shop'), status);
  }
});
