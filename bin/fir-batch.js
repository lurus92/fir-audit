#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { loadTasks } from '../src/audit.js';
import { runBatch, toCsv } from '../src/batch.js';

const HELP = `fir-batch: run fir-audit across a list of sites

Usage
  fir-batch <sites.json> [options]

Options
  --tasks <file>      Task suite (default: tasks/ecommerce.json)
  --max-pages <n>     Pages per site (default: 40)
  --delay <ms>        Minimum delay between requests (default: 1000)
  --threshold <0-1>   Failure threshold (default: 0.6)
  --model <name>      LLM model (default: gpt-4o-mini, or $FIR_MODEL)
  --out <dir>         Output folder (default: reports/<date>[-dry-run])
  --dry-run           Crawl and match only; no LLM calls

Writes one JSON report per site plus summary.csv to the output folder.`;

const args = { _: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '-h' || argv[i] === '--help') args.help = true;
  else if (argv[i] === '--dry-run') args.dryRun = true;
  else if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
  else args._.push(argv[i]);
}
if (args.help || !args._[0]) { console.log(HELP); process.exit(args.help ? 0 : 1); }

const apiKey = process.env.OPENAI_API_KEY;
if (!args.dryRun && !apiKey) { console.error('OPENAI_API_KEY is not set. Set it, or use --dry-run.'); process.exit(1); }

const list = JSON.parse(await readFile(args._[0], 'utf8'));
const sites = Array.isArray(list) ? list : list.sites;
const tasks = await loadTasks(args.tasks || fileURLToPath(new URL('../tasks/ecommerce.json', import.meta.url)));
const out = args.out || `reports/${new Date().toISOString().slice(0, 10)}-${basename(args._[0], '.json')}${args.dryRun ? '-dry-run' : ''}`;
await mkdir(out, { recursive: true });

const rows = await runBatch(sites, tasks, {
  maxPages: Number(args['max-pages'] || 40),
  delayMs: Number(args.delay || 1000),
  threshold: Number(args.threshold || 0.6),
  minPages: Number(args['min-pages'] || 5),
  dryRun: Boolean(args.dryRun),
  llm: { apiKey, model: args.model || process.env.FIR_MODEL || 'gpt-4o-mini', baseUrl: process.env.FIR_BASE_URL },
}, {
  log: (m) => console.error(m),
  onReport: (site, report) => writeFile(`${out}/${new URL(site.url).host.replace(/^www\./, '')}.json`, JSON.stringify(report, null, 2)),
});
await writeFile(`${out}/summary.csv`, toCsv(rows));

const count = (s) => rows.filter((r) => r.status === s).length;
console.log(`\n${'site'.padEnd(20)} ${'status'.padEnd(8)} pages  matched  FIR`);
for (const r of rows) {
  const fir = r.fir === undefined ? '' : `${Math.round(r.fir * 100)}%`;
  console.log(`${r.name.slice(0, 20).padEnd(20)} ${r.status.padEnd(8)} ${String(r.pages).padStart(5)}  ${r.tasks_matched === undefined ? '' : `${r.tasks_matched}/${r.tasks_total}`.padStart(7)}  ${fir}`);
}
console.log(`\n${rows.length} sites: ${count('ok')} audited, ${count('blocked')} blocked, ${count('unreachable')} unreachable, ${count('insufficient')} too thin to score, ${count('no-help-content')} without reachable help content, ${count('error')} errors`);
console.log(`Summary: ${out}/summary.csv`);
