// HTML helpers. Adapted from FunnelScan (backend/utils/cleanHtml.js and
// backend/services/fetchWebsite.js).

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' };

function toText(html, limit) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|quot|#39|lt|gt);/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

// Page text for judging. Site chrome (navigation, mega-menus, header, footer)
// is removed, and <main> is preferred when it holds real content: on large
// shops the menu alone can fill the first several thousand characters.
export function cleanHtml(html, limit = 20000) {
  if (!html || typeof html !== 'string') return '';
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  const main = body.match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  if (main) {
    const text = toText(main[1], limit);
    if (text.length >= 200) return text;
  }
  return toText(body, limit);
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
