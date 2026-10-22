// HTML helpers. Adapted from FunnelScan (backend/utils/cleanHtml.js and
// backend/services/fetchWebsite.js).

// Named entities common on DACH/FR/IT/UK shop pages, plus all numeric ones.
// Undecoded entities broke both retrieval ("r&uuml;ckgabe" never matched
// "rückgabe") and quote verification in the first DACH run.
const NAMED = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', shy: '',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', Eacute: 'É', Egrave: 'È',
  aacute: 'á', agrave: 'à', acirc: 'â', Agrave: 'À', iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  oacute: 'ó', ograve: 'ò', ocirc: 'ô', uacute: 'ú', ugrave: 'ù', ucirc: 'û', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ',
  euro: '€', pound: '£', cent: '¢', yen: '¥', copy: '©', reg: '®', trade: '™', deg: '°', sect: '§', para: '¶',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', times: '×', divide: '÷', plusmn: '±',
  laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', ldquo: '“', rdquo: '”', bdquo: '„', lsquo: '‘', rsquo: '’', sbquo: '‚',
  thinsp: ' ', ensp: ' ', emsp: ' ', zwnj: '', zwj: '',
};

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return ' '; }
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
  });
}

function toText(html, limit) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
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
    .replace(/<!--[\s\S]*?-->/g, ' ')
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
