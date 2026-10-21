// Agent access: what a site *declares* to AI agents (robots.txt) and what it
// *does* to an honestly identified crawler (homepage response). Read-only:
// two requests per site, and no agent is ever impersonated.
import { parseRobots, isAllowed } from './robots.js';
import { USER_AGENT, fetchErrorReason } from './crawl.js';

// Published robots.txt tokens of AI crawlers and assistants (as of Oct 2026).
// "user" = fetches a page because a person asked their assistant to.
export const AI_AGENTS = [
  { token: 'GPTBot', vendor: 'OpenAI', purpose: 'training' },
  { token: 'OAI-SearchBot', vendor: 'OpenAI', purpose: 'search' },
  { token: 'ChatGPT-User', vendor: 'OpenAI', purpose: 'user' },
  { token: 'ClaudeBot', vendor: 'Anthropic', purpose: 'training' },
  { token: 'Claude-SearchBot', vendor: 'Anthropic', purpose: 'search' },
  { token: 'Claude-User', vendor: 'Anthropic', purpose: 'user' },
  { token: 'PerplexityBot', vendor: 'Perplexity', purpose: 'search' },
  { token: 'Perplexity-User', vendor: 'Perplexity', purpose: 'user' },
  { token: 'Google-Extended', vendor: 'Google', purpose: 'training' },
  { token: 'Applebot-Extended', vendor: 'Apple', purpose: 'training' },
  { token: 'Meta-ExternalAgent', vendor: 'Meta', purpose: 'training' },
  { token: 'Amazonbot', vendor: 'Amazon', purpose: 'search' },
  { token: 'CCBot', vendor: 'Common Crawl', purpose: 'training' },
  { token: 'Bytespider', vendor: 'ByteDance', purpose: 'training' },
];

// disallowed: the agent may not fetch the homepage at all
// restricted: a rule names this agent and disallows some paths
// allowed:    nothing stops it
export function agentPolicy(robotsText, token) {
  const r = parseRobots(robotsText, token);
  if (!isAllowed(r, '/')) return 'disallowed';
  if (r.matched === 'specific' && r.rules.some((x) => x.type === 'disallow' && x.path)) return 'restricted';
  return 'allowed';
}

async function get(url, fetchImpl, timeoutMs) {
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    return { status: res.status, ok: res.ok, text: res.ok ? await res.text() : '' };
  } catch (e) {
    return { status: 0, ok: false, error: fetchErrorReason(e), text: '' };
  }
}

export async function checkAccess(site, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const origin = new URL(site.url).origin;
  const robots = await get(`${origin}/robots.txt`, fetchImpl, timeoutMs);
  const home = await get(site.url, fetchImpl, timeoutMs);
  const crawler = home.ok ? 'ok' : home.status === 0 ? 'unreachable' : [401, 403, 429].includes(home.status) ? 'blocked' : 'error';
  const agents = Object.fromEntries(AI_AGENTS.map((a) => [a.token, robots.ok ? agentPolicy(robots.text, a.token) : 'no robots.txt']));
  return {
    name: site.name, url: site.url, country: site.country || '', type: site.type || '', size: site.size || '',
    crawler, homepage: home.status || home.error, robots: robots.status || robots.error,
    ...agents,
  };
}
