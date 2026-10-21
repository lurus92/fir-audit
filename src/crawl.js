// Polite, same-site, task-guided crawler. Link ranking adapted from FunnelScan
// (chooseTopLinks), tuned on the Oct 2026 DACH dry run: prefer help/service
// pages, and avoid product pages, query-string variants and language duplicates,
// which otherwise eat the page budget.
import { cleanHtml, extractTitle, extractLinks } from './html.js';
import { fetchRobots, isAllowed } from './robots.js';
import { sitemapUrls } from './sitemap.js';

export const USER_AGENT = 'fir-audit/0.1 (+https://github.com/lurus92/fir-audit)';
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|avif|zip|mp4|mp3|css|js|json|xml|ico|woff2?)(\?|$)/i;
const SERVICE_TERMS = ['hilfe', 'help', 'service', 'kundenservice', 'kundendienst', 'faq', 'support', 'kontakt', 'contact', 'policies', 'policy', 'agb', 'fragen', 'info'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// help.example.com and www.example.com belong to the same site; so do shop.co.uk subdomains.
export function siteKey(host) {
  const parts = host.toLowerCase().split('.');
  const n = /^(co|com|org|net|ac|gov)$/.test(parts.at(-2) || '') && parts.at(-1).length === 2 ? 3 : 2;
  return parts.slice(-n).join('.');
}

export function normalizeUrl(href) {
  const u = new URL(href);
  u.hash = '';
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

export function fetchErrorReason(e) {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout';
  const c = e?.cause;
  return c?.code ? `${c.code}${c.message ? ` ${c.message}` : ''}`.slice(0, 120) : e?.message || 'fetch failed';
}

export function linkScore(link, url, keywords) {
  let path;
  try { path = decodeURIComponent(url.pathname).toLowerCase(); } catch { path = url.pathname.toLowerCase(); }
  const text = (link.text || '').toLowerCase();
  let s = keywords.reduce((n, k) => n + (text.includes(k) ? 2 : 0) + (path.includes(k) ? 1 : 0), 0);
  if (SERVICE_TERMS.some((t) => path.includes(t) || text.includes(t))) s += 2;
  if (url.search) s -= 2;                                  // filters, searches, language variants
  if (/\d{6,}/.test(path) || path.length > 80) s -= 3;     // product pages
  if (path.split('/').filter(Boolean).length > 3) s -= 1;  // deep category trees
  return s;
}

export function rankLinks(links, keywords, seen, host) {
  const kws = keywords.map((k) => k.toLowerCase());
  const site = siteKey(host);
  return links
    .map((l) => {
      try { return { ...l, key: normalizeUrl(l.href), url: new URL(l.href) }; } catch { return null; }
    })
    .filter((l) => l && !seen.has(l.key) && siteKey(l.url.host) === site && !SKIP_EXT.test(l.url.pathname))
    .map(({ url, ...l }) => ({ ...l, score: linkScore(l, url, kws) }))
    .sort((a, b) => b.score - a.score);
}

export async function crawl(startUrl, { maxPages = 40, keywords = [], delayMs = 1000, timeoutMs = 20000, useSitemap = true, sitemapSeeds = 15, fetchImpl = fetch, log = () => {} } = {}) {
  const start = new URL(startUrl);
  const robots = await fetchRobots(start.origin, { fetchImpl, userAgent: USER_AGENT });
  const delay = Math.max(delayMs, (robots.crawlDelay || 0) * 1000);
  const queue = [{ href: start.toString(), score: Infinity }];
  const seen = new Set([normalizeUrl(start.toString())]);
  const robotsByOrigin = new Map([[start.origin, robots]]);

  // Seed the queue with the sitemap's most service-like pages.
  if (useSitemap) {
    const fromSitemap = await sitemapUrls(start.origin, robots.sitemaps, { fetchImpl, userAgent: USER_AGENT, timeoutMs });
    const seeds = rankLinks(fromSitemap.map((href) => ({ href, text: '' })), keywords, seen, start.host)
      .filter((l) => l.score >= 3)
      .slice(0, sitemapSeeds);
    for (const l of seeds) { seen.add(l.key); queue.push({ ...l, score: l.score + 3 }); }
    if (fromSitemap.length) log(`  sitemap: ${fromSitemap.length} URLs, ${seeds.length} service pages queued`);
  }
  const pages = [];
  const skipped = [];

  while (queue.length && pages.length < maxPages) {
    queue.sort((a, b) => b.score - a.score);
    const { href } = queue.shift();
    const u = new URL(href);
    if (!robotsByOrigin.has(u.origin)) robotsByOrigin.set(u.origin, await fetchRobots(u.origin, { fetchImpl, userAgent: USER_AGENT }));
    if (!isAllowed(robotsByOrigin.get(u.origin), u.pathname + u.search)) { skipped.push({ url: href, reason: 'disallowed by robots.txt' }); continue; }

    let res;
    try {
      res = await fetchImpl(href, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) { skipped.push({ url: href, reason: fetchErrorReason(e) }); continue; }
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
