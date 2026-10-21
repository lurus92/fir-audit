// Sitemap discovery: help and policy pages are often missing from a static
// homepage's links (JavaScript menus, separate help centres) but are listed in
// the sitemap. Content/page sitemaps are read before product sitemaps.
import { gunzipSync } from 'node:zlib';

const LOW_VALUE = /product|produkt|artikel|item|catalog|categor|kategorie|brand|marke|image|video|blog|news|stor(y|ies)|magazin/i;

export function parseSitemap(xml) {
  const locs = [...String(xml).matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  return { locs, isIndex: /<sitemapindex/i.test(xml) };
}

export async function sitemapUrls(origin, declared, { fetchImpl = fetch, userAgent, timeoutMs = 20000, maxFiles = 6, maxUrls = 20000 } = {}) {
  const queue = declared?.length ? [...declared] : [`${origin}/sitemap.xml`];
  const seen = new Set();
  const urls = [];
  let files = 0;
  while (queue.length && files < maxFiles && urls.length < maxUrls) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    files += 1;
    let xml;
    try {
      const res = await fetchImpl(u, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue;
      if (/\.gz(\?|$)/.test(u)) {
        const buf = Buffer.from(await res.arrayBuffer());
        try { xml = gunzipSync(buf).toString('utf8'); } catch { xml = buf.toString('utf8'); }
      } else {
        xml = await res.text();
      }
    } catch { continue; }
    const { locs, isIndex } = parseSitemap(xml);
    if (isIndex) queue.push(...locs.sort((a, b) => LOW_VALUE.test(a) - LOW_VALUE.test(b)));
    else urls.push(...locs);
  }
  return urls.slice(0, maxUrls);
}
