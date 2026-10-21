import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, isAllowed } from '../src/robots.js';

test('uses the * group and longest match wins', () => {
  const r = parseRobots('User-agent: *\nDisallow: /account\nAllow: /account/help\nCrawl-delay: 2');
  assert.equal(isAllowed(r, '/account/orders'), false);
  assert.equal(isAllowed(r, '/account/help/returns'), true);
  assert.equal(isAllowed(r, '/returns'), true);
  assert.equal(r.crawlDelay, 2);
});

test('a group naming fir-audit overrides *', () => {
  const r = parseRobots('User-agent: *\nDisallow:\n\nUser-agent: fir-audit\nDisallow: /');
  assert.equal(isAllowed(r, '/anything'), false);
});

test('wildcards and end anchors', () => {
  const r = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /search*q=');
  assert.equal(isAllowed(r, '/files/terms.pdf'), false);
  assert.equal(isAllowed(r, '/files/terms.pdf.html'), true);
  assert.equal(isAllowed(r, '/search?q=shoes'), false);
});

test('empty robots allows everything', () => {
  assert.equal(isAllowed(parseRobots(''), '/x'), true);
});
