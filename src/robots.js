// Minimal robots.txt support: user-agent groups, Allow/Disallow with * and $,
// longest match wins (Allow wins ties), Crawl-delay.

export function parseRobots(text, agent = 'fir-audit') {
  const groups = [];
  const sitemaps = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const i = line.indexOf(':');
    if (!line || i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], crawlDelay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') { if (/^https?:\/\//.test(val)) sitemaps.push(val); continue; }
    if (!cur) continue;
    if (key === 'allow' || key === 'disallow') cur.rules.push({ type: key, path: val });
    else if (key === 'crawl-delay') cur.crawlDelay = Number(val) || null;
  }
  const a = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((x) => x !== '*' && a.includes(x)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return {
    sitemaps,
    matched: specific.length ? 'specific' : chosen.length ? 'wildcard' : 'none',
    rules: chosen.flatMap((g) => g.rules),
    crawlDelay: chosen.map((g) => g.crawlDelay).find((x) => x != null) ?? null,
  };
}

function toRegex(pattern) {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

export function isAllowed(robots, path) {
  let best = null;
  for (const r of robots.rules) {
    if (!r.path || !toRegex(r.path).test(path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) best = r;
  }
  return !best || best.type === 'allow';
}

export async function fetchRobots(origin, { fetchImpl = fetch, userAgent } = {}) {
  try {
    const res = await fetchImpl(new URL('/robots.txt', origin).toString(), { headers: { 'User-Agent': userAgent } });
    if (!res.ok) return { rules: [], crawlDelay: null, sitemaps: [] };
    return parseRobots(await res.text(), userAgent);
  } catch {
    return { rules: [], crawlDelay: null, sitemaps: [] };
  }
}
