// Polite, same-site, task-guided crawler. Link ranking adapted from FunnelScan
// (chooseTopLinks): links whose URL or anchor text match the audit tasks'
// keywords are fetched first, so a small page budget covers what matters.
import { cleanHtml, extractTitle, extractLinks } from './html.js';
import { fetchRobots, isAllowed } from './robots.js';

export const USER_AGENT = 'fir-audit/0.1 (+https://github.com/lurus92/fir-audit)';
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|avif|zip|mp4|mp3|css|js|json|xml|ico|woff2?)(\?|$)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bareHost = (h) => h.replace(/^www\./, '');

export function normalizeUrl(href) {
  const u = new URL(href);
  u.hash = '';
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

export function rankLinks(links, keywords, seen, host) {
  const kws = keywords.map((k) => k.toLowerCase());
  return links
    .map((l) => {
      try { return { ...l, key: normalizeUrl(l.href), url: new URL(l.href) }; } catch { return null; }
    })
    .filter((l) => l && !seen.has(l.key) && bareHost(l.url.host) === bareHost(host) && !SKIP_EXT.test(l.url.pathname))
    .map(({ url, ...l }) => {
      const hay = `${l.href} ${l.text}`.toLowerCase();
      return { ...l, score: kws.reduce((n, k) => n + (hay.includes(k) ? 1 : 0), 0) };
    })
    .sort((a, b) => b.score - a.score);
}

export async function crawl(startUrl, { maxPages = 40, keywords = [], delayMs = 1000, fetchImpl = fetch, log = () => {} } = {}) {
  const start = new URL(startUrl);
  const robots = await fetchRobots(start.origin, { fetchImpl, userAgent: USER_AGENT });
  const delay = Math.max(delayMs, (robots.crawlDelay || 0) * 1000);
  const queue = [{ href: start.toString(), score: Infinity }];
  const seen = new Set([normalizeUrl(start.toString())]);
  const pages = [];
  const skipped = [];

  while (queue.length && pages.length < maxPages) {
    queue.sort((a, b) => b.score - a.score);
    const { href } = queue.shift();
    const u = new URL(href);
    if (!isAllowed(robots, u.pathname + u.search)) { skipped.push({ url: href, reason: 'disallowed by robots.txt' }); continue; }

    let res;
    try {
      res = await fetchImpl(href, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, redirect: 'follow' });
    } catch (e) { skipped.push({ url: href, reason: e.message }); continue; }
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('html')) { skipped.push({ url: href, reason: `${res.status} ${type}`.trim() }); continue; }

    const html = await res.text();
    pages.push({ url: href, title: extractTitle(html), text: cleanHtml(html) });
    log(`  fetched ${pages.length}/${maxPages}  ${href}`);

    for (const link of rankLinks(extractLinks(html, href), keywords, seen, start.host)) {
      seen.add(link.key);
      queue.push(link);
    }
    if (queue.length && pages.length < maxPages && delay) await sleep(delay);
  }
  return { pages, skipped, robots };
}
