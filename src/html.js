// HTML helpers. Adapted from FunnelScan (backend/utils/cleanHtml.js and
// backend/services/fetchWebsite.js).

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

export function cleanHtml(html, limit = 8000) {
  if (!html || typeof html !== 'string') return '';
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|quot|#39|lt|gt);/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, limit);
}

export function extractTitle(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? cleanHtml(m[1], 160) : '';
}

export function extractLinks(html, baseUrl) {
  const seen = new Set();
  const links = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    let href;
    try { href = new URL(m[1].trim(), baseUrl).toString(); } catch { continue; }
    if (!href.startsWith('http') || seen.has(href)) continue;
    seen.add(href);
    links.push({ href, text: cleanHtml(m[2] || '', 120) || href });
  }
  return links;
}
