import { readFile } from 'node:fs/promises';
import { crawl } from './crawl.js';
import { rankPages } from './retrieve.js';
import { judge } from './judge.js';
import { classifyIntent } from './intent.js';
import { failedIntentRate } from './score.js';

export const VERSION = '0.1.0';
export const MIN_PAGES = 5;

export async function loadTasks(path) {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const tasks = Array.isArray(raw) ? raw : raw.tasks;
  return tasks.map((t, i) => ({ id: t.id || `task-${i + 1}`, keywords: [], ...t, intent: t.intent || classifyIntent(t.task) }));
}

export async function audit(url, tasks, opts = {}) {
  const { maxPages = 40, delayMs = 1000, threshold = 0.6, dryRun = false, log = () => {}, fetchImpl = fetch } = opts;
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
    crawl: { pagesFetched: pages.length, pagesSkipped: skipped.length, skipped },
  };

  // A site that refuses the crawler has not failed any intent we can measure.
  // Scoring it would report a false 100% FIR, so record access, never a score.
  if (pages.length === 0) {
    return { ...base, access: { status: 'blocked', reason: skipped[0]?.reason || 'no pages fetched' }, warnings: [], summary: null, results: [] };
  }
  const warnings = pages.length < MIN_PAGES
    ? [`Only ${pages.length} page(s) crawled. FIR on so small a sample is unreliable; do not publish it.`]
    : [];

  const results = [];
  for (const task of tasks) {
    const candidates = rankPages(task, pages);
    const row = { id: task.id, task: task.task, intent: task.intent, candidates: candidates.map((c) => c.url) };
    if (dryRun) { results.push(row); continue; }
    log(`  judging  ${task.id}`);
    results.push({ ...row, ...(await judge(task, candidates, { ...opts.llm, fetchImpl })) });
  }

  return { ...base, access: { status: 'ok' }, warnings, summary: dryRun ? null : failedIntentRate(results, threshold), results };
}
