import { readFile } from 'node:fs/promises';
import { crawl } from './crawl.js';
import { rankPages } from './retrieve.js';
import { judge } from './judge.js';
import { classifyIntent } from './intent.js';
import { failedIntentRate } from './score.js';

export const VERSION = '0.1.0';

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

  const results = [];
  for (const task of tasks) {
    const candidates = rankPages(task, pages);
    const base = { id: task.id, task: task.task, intent: task.intent, candidates: candidates.map((c) => c.url) };
    if (dryRun) { results.push(base); continue; }
    log(`  judging  ${task.id}`);
    results.push({ ...base, ...(await judge(task, candidates, { ...opts.llm, fetchImpl })) });
  }

  return {
    tool: 'fir-audit',
    version: VERSION,
    site: url,
    auditedAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'static',
    settings: { maxPages, threshold, model: dryRun ? null : opts.llm?.model },
    crawl: { pagesFetched: pages.length, pagesSkipped: skipped.length, skipped },
    summary: dryRun ? null : failedIntentRate(results, threshold),
    results,
  };
}
