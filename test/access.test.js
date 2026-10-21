import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentPolicy, checkAccess } from '../src/access.js';
import { fetchErrorReason, linkScore, siteKey } from '../src/crawl.js';

const ROBOTS = `User-agent: *
Disallow: /checkout

User-agent: GPTBot
User-agent: CCBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /account`;

test('agent policy: disallowed, restricted, allowed', () => {
  assert.equal(agentPolicy(ROBOTS, 'GPTBot'), 'disallowed');
  assert.equal(agentPolicy(ROBOTS, 'CCBot'), 'disallowed');
  assert.equal(agentPolicy(ROBOTS, 'ChatGPT-User'), 'restricted');
  assert.equal(agentPolicy(ROBOTS, 'ClaudeBot'), 'allowed');
});

test('a wildcard Disallow: / disallows every agent', () => {
  assert.equal(agentPolicy('User-agent: *\nDisallow: /', 'Claude-User'), 'disallowed');
});

test('checkAccess separates blocked from unreachable', async () => {
  const blocked = async (url) => ({ ok: !url.endsWith('/') ? true : false, status: url.endsWith('robots.txt') ? 200 : 403, text: async () => ROBOTS });
  const r = await checkAccess({ name: 'B', url: 'https://b.test/' }, { fetchImpl: blocked });
  assert.equal(r.crawler, 'blocked');
  assert.equal(r.GPTBot, 'disallowed');
  const down = async () => { const e = new Error('fetch failed'); e.cause = { code: 'ENOTFOUND', message: 'getaddrinfo' }; throw e; };
  const d = await checkAccess({ name: 'D', url: 'https://d.test/' }, { fetchImpl: down });
  assert.equal(d.crawler, 'unreachable');
  assert.match(d.homepage, /ENOTFOUND/);
});

test('fetch errors keep their underlying cause', () => {
  const e = new Error('fetch failed'); e.cause = { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'Connect Timeout Error' };
  assert.match(fetchErrorReason(e), /UND_ERR_CONNECT_TIMEOUT/);
  assert.equal(fetchErrorReason(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'timeout');
});

test('help subdomains count as the same site', () => {
  assert.equal(siteKey('support.gymshark.com'), siteKey('www.gymshark.com'));
  assert.equal(siteKey('help.next.co.uk'), 'next.co.uk');
});

test('service pages outrank product pages that happen to contain a keyword', () => {
  const kws = ['garantie', 'versand'];
  const help = { text: 'Versand & Lieferung' };
  const product = { text: 'Kühlschrank 5 Jahre Garantie' };
  const s1 = linkScore(help, new URL('https://www.otto.de/shoppages/service/versand'), kws);
  const s2 = linkScore(product, new URL('https://www.otto.de/p/hanseatic-side-by-side-5-jahre-kostenlose-langzeitgarantie-1688597541/'), kws);
  const s3 = linkScore({ text: 'Mode' }, new URL('https://www.otto.de/mode/?s=schweizer'), ['schweiz']);
  assert.ok(s1 > s2, `${s1} > ${s2}`);
  assert.ok(s3 <= 0);
});
