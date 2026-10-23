import { readFile } from 'node:fs/promises';
import { crawl, isServicePage } from './crawl.js';
import { rankPages } from './retrieve.js';
import { judge, withVerifier } from './judge.js';
import { classifyIntent } from './intent.js';
import { failedIntentRate } from './score.js';

export const VERSION = '0.1.0';
export const MIN_PAGES = 5;
export const MIN_SERVICE_PAGES = 5;

export async function loadTasks(path) {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const tasks = Array.isArray(raw) ? raw : raw.tasks;
  return tasks.map((t, i) => ({ id: t.id || `task-${i + 1}`, keywords: [], ...t, intent: t.intent || classifyIntent(t.task) }));
}

export async function audit(url, tasks, opts = {}) {
  const { maxPages = 40, delayMs = 1000, threshold = 0.6, minPages = MIN_PAGES, minServicePages = MIN_SERVICE_PAGES, dryRun = false, log = () => {}, fetchImpl = fetch } = opts;
  const keywords = [...new Set(tasks.flatMap((t) => t.keywords))];

  log(`Crawling ${url} (max ${maxPages} pages, robots.txt respected)`);
  const { pages, skipped } = await crawl(url, { maxPages, keywords, delayMs, fetchImpl, log });
  const base = {
    tool: 'fir-audit',
    version: VERSION,
    site: url,
    auditedAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'static',
    settings: { maxPages, threshold, model: dryRun ? null : opts.llm?.model },
    crawl: { pagesFetched: pages.length, servicePages: pages.filter(isServicePage).map((p) => p.url), pagesSkipped: skipped.length, skipped },
  };

  // A site that refuses the crawler has not failed any intent we can measure.
  // Scoring it would report a false 100% FIR, so record access, never a score.
  // blocked:      the site refused us (401/403/429 or robots.txt)
  // unreachable:  DNS, TLS, timeouts, 5xx; says nothing about the site's policy
  // insufficient: too few pages to judge (usually a JavaScript-rendered site)
  // None of these are scored: an unmeasured site must never look like a 100% FIR.
  if (pages.length < minPages) {
    let status = 'insufficient';
    let reason = `only ${pages.length} page(s) crawled; likely rendered with JavaScript`;
    if (pages.length === 0) {
      reason = skipped[0]?.reason || 'no pages fetched';
      status = /^(401|403|429)\b|robots/.test(reason) ? 'blocked' : 'unreachable';
    }
    return { ...base, access: { status, reason }, warnings: [], summary: null, results: [] };
  }
  // Reached pages, but none of them help or policy content: any "failure" would
  // be our crawler's, not the site's. Recorded as a finding, never scored.
  if (base.crawl.servicePages.length === 0) {
    return { ...base, access: { status: 'no-help-content', reason: 'no help or policy page reachable without JavaScript' }, warnings: [], summary: null, results: [] };
  }
  if (base.crawl.servicePages.length < minServicePages) {
    return { ...base, access: { status: 'low-coverage', reason: `only ${base.crawl.servicePages.length} help/policy page(s) reachable without JavaScript` }, warnings: [], summary: null, results: [] };
  }
  const warnings = [];

  const results = [];
  for (const task of tasks) {
    const candidates = rankPages(task, pages);
    const row = { id: task.id, task: task.task, intent: task.intent, candidates: candidates.map((c) => c.url) };
    if (dryRun) { results.push(row); continue; }
    log(`  judging  ${task.id}`);
    const judged = await judge(task, candidates, { ...opts.llm, fetchImpl });
    results.push({ ...row, ...(opts.verify === true ? await withVerifier(judged, task.task, { ...opts.llm, fetchImpl }) : judged) });
  }

  return { ...base, access: { status: 'ok' }, warnings, summary: dryRun ? null : failedIntentRate(results, threshold), results };
}
