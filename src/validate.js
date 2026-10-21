// Human validation of the LLM judge: sample verdicts for hand-checking, then
// measure agreement. A FIR is only as credible as its judge.
const isPass = (r, threshold) => r.fulfilled && r.confidence >= threshold;

// Stratified sample: half passes, half failures (as far as available), excluding
// "no page matched" failures, which need no judgement.
export function sampleVerdicts(reports, n = 50, { threshold = 0.6, seed = 42 } = {}) {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const shuffle = (a) => a.map((v) => [rand(), v]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const rows = reports.flatMap((rep) => rep.results
    .filter((r) => r.candidates?.length)
    .map((r) => ({
      site: new URL(rep.site).host.replace(/^www\./, ''),
      task_id: r.id,
      task: r.task,
      judge: isPass(r, threshold) ? 'pass' : 'fail',
      confidence: r.confidence,
      evidence_url: r.evidence_url || r.candidates[0],
      evidence_quote: r.evidence_quote || '',
      reason: r.reason,
      pages_shown: r.candidates.join(' '),
    })));
  const passes = shuffle(rows.filter((r) => r.judge === 'pass'));
  const fails = shuffle(rows.filter((r) => r.judge === 'fail'));
  const half = Math.floor(n / 2);
  const take = [...passes.slice(0, Math.max(half, n - fails.length)), ...fails.slice(0, Math.max(n - half, n - passes.length))].slice(0, n);
  return shuffle(take).map((r, i) => ({ n: i + 1, ...r, human: '', note: '' }));
}

// Agreement between judge and human, with Cohen's kappa.
export function agreement(rows) {
  const done = rows.filter((r) => /^(pass|fail)$/i.test(String(r.human).trim()));
  const h = (r) => String(r.human).trim().toLowerCase();
  const c = { pp: 0, pf: 0, fp: 0, ff: 0 };
  for (const r of done) c[(r.judge === 'pass' ? 'p' : 'f') + (h(r) === 'pass' ? 'p' : 'f')] += 1;
  const total = done.length;
  if (!total) return { total: 0 };
  const po = (c.pp + c.ff) / total;
  const pe = ((c.pp + c.pf) * (c.pp + c.fp) + (c.fp + c.ff) * (c.pf + c.ff)) / (total * total);
  return {
    total,
    agreement: po,
    kappa: pe === 1 ? 1 : (po - pe) / (1 - pe),
    false_pass: c.pf,   // judge said answered, human disagrees
    false_fail: c.fp,   // judge said failed, but the answer was there
    matrix: c,
  };
}
