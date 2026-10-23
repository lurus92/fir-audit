// Pre-publication outreach: one email per audited shop, built from a frozen
// run and a wording template. Five variants follow the site's access state.
// The code only fills placeholders; every word lives in the template.

const fill = (text, vars) => String(text).replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] ?? m));
const host = (url) => new URL(url).host.replace(/^www\./, '');
const isPass = (r, threshold) => r.fulfilled && r.confidence >= threshold;
const day = (iso) => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${Number(iso.slice(8, 10))} ${months.at(Number(iso.slice(5, 7)) - 1)} ${iso.slice(0, 4)}`;
};

// access rows: [{url, crawler, 'ChatGPT-User', 'Claude-User', 'Perplexity-User', robots}, ...] across runs
export function accessFacts(siteUrl, accessRows, auditRun = null) {
  const mine = accessRows.filter((a) => a.url && host(a.url) === host(siteUrl));
  const runs = [...mine.map((a) => a.crawler), ...(auditRun ? [auditRun] : [])];
  const assistants = ['ChatGPT-User', 'Claude-User', 'Perplexity-User'];
  const robotsReadable = mine.some((a) => String(a.robots) === '200');
  const allowsAssistants = robotsReadable && mine.filter((a) => String(a.robots) === '200')
    .every((a) => assistants.every((t) => a[t] === 'allowed' || a[t] === 'restricted'));
  return {
    totalRuns: runs.length,
    blockedRuns: runs.filter((c) => c === 'blocked').length,
    robotsReadable,
    allowsAssistants,
  };
}

export function buildEmail(report, { template, shopName, accessRows = [], accessDates = [], notes = [], threshold = 0.6 }) {
  const t = template;
  const results = report.results || [];
  const failures = results.filter((r) => !isPass(r, threshold));
  const facts = accessFacts(report.site, accessRows, report.access.status === 'blocked' ? 'blocked' : report.access.status === 'ok' ? 'ok' : null);
  let state = report.access.status === 'ok' ? 'readable' : report.access.status;
  // Blocked only when most checks agree (the study's own rule).
  if (state === 'blocked' && facts.totalRuns > 1 && facts.blockedRuns * 2 <= facts.totalRuns) state = 'blocked-varied';
  if (!t.results[state]) throw new Error(`No template variant for state "${state}"`);
  const dates = [report.auditedAt, ...accessDates].filter(Boolean).sort();
  const note = (id) => notes.find((n) => host(`https://${n.site}`) === host(report.site) && n.task_id === id)?.missing;

  const vars = {
    ...t.sender, ...t.study,
    shop: shopName || host(report.site),
    host: host(report.site),
    audit_date: day(report.auditedAt),
    asked: String(results.length || 10),
    answered: String(results.length - failures.length),
    service_pages: String(report.crawl?.servicePages?.length ?? 0),
    http_status: (report.access.reason || '').match(/^\d{3}/)?.[0] || '',
    reason: report.access.reason || '',
    blocked_runs: String(facts.blockedRuns),
    total_runs: String(facts.totalRuns),
    first_check: day(dates.at(0)),
    last_check: day(dates.at(-1)),
  };

  vars.failures_block = state !== 'readable' ? ''
    : failures.length === 0 ? t.no_failures
      : fill(t.failures_heading, vars) + '\n' + failures.map((r) => fill(t.failure_line, {
        intent: t.intent_names[r.id] || r.id,
        missing: note(r.id) || t.missing_by_intent[r.id] || `we found no page answering "${r.task}"`,
      })).join('\n');
  vars.robots_line = state !== 'blocked' ? ''
    : facts.allowsAssistants ? fill(t.robots_allowed, vars)
      : !facts.robotsReadable && facts.totalRuns ? fill(t.robots_refused, vars) : '';
  vars.runs_line = '';

  const body = [
    fill(t.opening, vars),
    fill(t.results[state], vars),
    fill(typeof t.method === 'string' ? t.method : t.method[state === 'readable' ? 'readable' : 'access'], vars),
    fill(t.ask, vars),
    t.sender.signature,
    t.sender.disclosure ? `\n${t.sender.disclosure}` : '',
  ].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n');

  return { site: host(report.site), shop: vars.shop, state, subject: fill(t.subjects[state], vars), body, failures: failures.map((r) => r.id) };
}
