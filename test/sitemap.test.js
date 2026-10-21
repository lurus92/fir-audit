import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { parseRobots } from '../src/robots.js';
import { parseSitemap, sitemapUrls } from '../src/sitemap.js';
import { crawl } from '../src/crawl.js';

test('robots.txt sitemaps are collected', () => {
  const r = parseRobots('Sitemap: https://s.test/sm.xml\nUser-agent: *\nDisallow: /x\nSitemap: https://s.test/sm2.xml.gz');
  assert.deepEqual(r.sitemaps, ['https://s.test/sm.xml', 'https://s.test/sm2.xml.gz']);
});

test('parses url sets, indexes and CDATA', () => {
  assert.deepEqual(parseSitemap('<urlset><url><loc>https://a.test/x?a=1&amp;b=2</loc></url></urlset>').locs, ['https://a.test/x?a=1&b=2']);
  const idx = parseSitemap('<sitemapindex><sitemap><loc><![CDATA[https://a.test/s.xml]]></loc></sitemap></sitemapindex>');
  assert.equal(idx.isIndex, true);
  assert.deepEqual(idx.locs, ['https://a.test/s.xml']);
});

test('follows an index, content sitemaps first, gzip supported', async () => {
  const files = {
    'https://s.test/index.xml': '<sitemapindex><sitemap><loc>https://s.test/products.xml</loc></sitemap><sitemap><loc>https://s.test/pages.xml.gz</loc></sitemap></sitemapindex>',
    'https://s.test/pages.xml.gz': gzipSync('<urlset><url><loc>https://s.test/hilfe/rueckgabe</loc></url></urlset>'),
    'https://s.test/products.xml': '<urlset><url><loc>https://s.test/p/123456789</loc></url></urlset>',
  };
  const fetchImpl = async (u) => ({
    ok: u in files,
    text: async () => String(files[u]),
    arrayBuffer: async () => { const b = Buffer.from(files[u]); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); },
  });
  const urls = await sitemapUrls('https://s.test', ['https://s.test/index.xml'], { fetchImpl });
  assert.deepEqual(urls, ['https://s.test/hilfe/rueckgabe', 'https://s.test/p/123456789']);
});

test('crawl reaches a help page that only the sitemap lists', async () => {
  const routes = {
    '/robots.txt': 'Sitemap: https://s.test/sitemap.xml',
    '/sitemap.xml': '<urlset><url><loc>https://s.test/service/rueckgabe</loc></url><url><loc>https://s.test/p/123456789</loc></url></urlset>',
    '/': '<title>Shop</title><a href="/p/123456789">Jacke</a>',
    '/service/rueckgabe': '<title>Rückgabe</title><p>30 Tage</p>',
    '/p/123456789': '<title>Jacke</title>',
  };
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    return { ok: path in routes, status: path in routes ? 200 : 404, headers: { get: () => 'text/html' }, text: async () => routes[path] || '' };
  };
  const { pages } = await crawl('https://s.test/', { keywords: ['rueckgabe'], delayMs: 0, maxPages: 2, fetchImpl });
  assert.deepEqual(pages.map((p) => new URL(p.url).pathname), ['/', '/service/rueckgabe']);
});
