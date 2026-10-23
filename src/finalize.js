// Apply human verdicts from one or more validation files to a run. A human
// verdict always wins over the judge, and every result records who decided it.
import { failedIntentRate } from './score.js';

export function applyHumanVerdicts(reports, labels, threshold = 0.6) {
  const key = (site, id) => `${site}|${id}`;
  const human = new Map(labels.filter((l) => /^(pass|fail)$/i.test(String(l.human).trim()))
    .map((l) => [key(l.site, l.task_id), { verdict: l.human.trim().toLowerCase(), note: l.note || '' }]));
  return reports.map((rep) => {
    if (!rep.summary) return rep;
    const site = new URL(rep.site).host.replace(/^www\./, '');
    const results = rep.results.map((r) => {
      const h = human.get(key(site, r.id));
      const judgePass = r.fulfilled && r.confidence >= threshold;
      if (!h) return { ...r, decided_by: 'judge', judge_pass: judgePass };
      return { ...r, decided_by: 'human', judge_pass: judgePass, human_note: h.note, fulfilled: h.verdict === 'pass', confidence: h.verdict === 'pass' ? 1 : r.confidence };
    });
    const failures = results.filter((r) => !(r.fulfilled && r.confidence >= threshold));
    return {
      ...rep,
      results,
      summary: failedIntentRate(results, threshold),
      verification: {
        human_checked: results.filter((r) => r.decided_by === 'human').length,
        failures_human_confirmed: failures.filter((r) => r.decided_by === 'human').length,
        failures_total: failures.length,
      },
    };
  });
}
