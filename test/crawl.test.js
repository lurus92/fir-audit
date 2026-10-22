import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crawl, USER_AGENT } from '../src/crawl.js';
import { rankPages } from '../src/retrieve.js';
import { fakeSite } from './helpers.js';

const site = fakeSite({
  '/robots.txt': 'User-agent: *\nDisallow: /account',
  '/': '<title>Shop</title><a href="/about">About us</a><a href="/help/returns">Returns</a><a href="/account">My account</a><a href="https://other.com/x">x</a><a href="/logo.png">logo</a>',
  '/help/returns': '<title>Returns</title><p>You can return any item within 30 days for a full refund.</p>',
  '/about': '<title>About</title><p>We started in Milan in 1999.</p>',
});

test('crawls same-site pages, keyword links first, respecting robots.txt', async () => {
  const { pages, skipped } = await crawl('https://shop.test/', { keywords: ['returns'], delayMs: 0, fetchImpl: site.fetchImpl });
  assert.deepEqual(pages.map((p) => new URL(p.url).pathname), ['/', '/help/returns', '/about']);
  assert.ok(skipped.some((s) => s.url.endsWith('/account') && /robots/.test(s.reason)));
  assert.ok(!site.calls.some((c) => c.url.includes('other.com') || c.url.endsWith('.png')));
  assert.ok(site.calls.every((c) => c.init.headers?.['User-Agent'] === USER_AGENT));
});

test('stops at the page budget', async () => {
  const { pages } = await crawl('https://shop.test/', { maxPages: 1, delayMs: 0, fetchImpl: site.fetchImpl });
  assert.equal(pages.length, 1);
});

test('retrieval ranks the returns page first for a returns task', async () => {
  const { pages } = await crawl('https://shop.test/', { delayMs: 0, fetchImpl: site.fetchImpl });
  const top = rankPages({ task: 'What is the return policy?', keywords: ['return', 'refund'] }, pages);
  assert.equal(new URL(top[0].url).pathname, '/help/returns');
});

test('empty, blog and privacy pages do not count as help content', async () => {
  const { isServicePage } = await import('../src/crawl.js');
  const long = 'x'.repeat(300);
  assert.equal(isServicePage({ url: 'https://s.test/faq/returns', title: 'Returns', text: '' }), false);
  assert.equal(isServicePage({ url: 'https://s.test/stories/support-shoe-guide', title: 'Support shoes', text: long }), false);
  assert.equal(isServicePage({ url: 'https://s.test/privacy-policy', title: 'Privacy', text: long }), false);
  assert.equal(isServicePage({ url: 'https://s.test/hilfe/rueckgabe', title: 'Rückgabe', text: long }), true);
});
