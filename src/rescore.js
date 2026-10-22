// Re-apply the current verification and coverage rules to a stored report,
// without crawling or calling the LLM again. Keeps the judge's raw verdicts.
import { verifyQuote } from './judge.js';
import { isServicePage } from './crawl.js';
import { MIN_SERVICE_PAGES } from './audit.js';
import { failedIntentRate } from './score.js';

export function rescore(report) {
  if (report.access?.status !== 'ok' && report.access?.status !== 'low-coverage') return report;
  const servicePages = (report.crawl.servicePages || []).filter((url) => isServicePage({ url }));
  const crawl = { ...report.crawl, servicePages };
  if (servicePages.length < MIN_SERVICE_PAGES) {
    return { ...report, crawl, access: { status: 'low-coverage', reason: `only ${servicePages.length} help/policy page(s) reachable without JavaScript` }, summary: null, rescored: true };
  }
  const results = report.results.map((r) => {
    if (!r.candidates?.length || !r.excerpts) return r;
    const judgedAnswered = r.quote_verified !== undefined ? (r.fulfilled || /quote is not in the page text/.test(r.reason)) : r.fulfilled;
    const ok = judgedAnswered && verifyQuote(r.evidence_quote, r.excerpts.map((e) => e.text).join(' '));
    const reason = r.reason.replace(/^Judged answered, but its evidence quote is not in the page text; counted as not fulfilled\. \((.*)\)$/s, '$1');
    return {
      ...r,
      fulfilled: ok,
      quote_verified: ok || !judgedAnswered ? r.quote_verified && ok : false,
      reason: judgedAnswered && !ok ? `Judged answered, but its evidence quote is not in the page text; counted as not fulfilled. (${reason})` : reason,
    };
  });
  return { ...report, crawl, results, summary: failedIntentRate(results, report.settings?.threshold ?? 0.6), rescored: true };
}
