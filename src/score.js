// Failed Intent Rate = intents the site could not fulfil / intents attempted.
// An intent counts as failed when it was not fulfilled, or fulfilled with
// confidence below the threshold (the same trust gate AskVio uses for
// forcedNoAnswer).
export function isFailed(r, threshold) {
  return !r.fulfilled || (r.confidence ?? 0) < threshold;
}

const rate = (failed, total) => ({ total, failed, fir: total ? failed / total : 0 });

export function failedIntentRate(results, threshold = 0.6) {
  const byIntent = {};
  let failed = 0;
  for (const r of results) {
    const f = isFailed(r, threshold);
    failed += f;
    const b = (byIntent[r.intent] ??= { total: 0, failed: 0 });
    b.total += 1;
    b.failed += f;
  }
  for (const k of Object.keys(byIntent)) byIntent[k] = rate(byIntent[k].failed, byIntent[k].total);
  return { ...rate(failed, results.length), threshold, byIntent };
}
