#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { audit, loadTasks, VERSION } from '../src/audit.js';

const HELP = `fir-audit ${VERSION}: measure the Failed Intent Rate of a website

Usage
  fir-audit <url> [options]

Options
  --tasks <file>        Task suite JSON (default: tasks/ecommerce.json)
  --max-pages <n>       Pages to crawl (default: 40)
  --delay <ms>          Minimum delay between requests (default: 1000)
  --threshold <0-1>     Confidence below which an intent counts as failed (default: 0.6)
  --model <name>        LLM model (default: gpt-4o-mini, or $FIR_MODEL)
  --base-url <url>      OpenAI-compatible API base URL (default: $FIR_BASE_URL or OpenAI)
  --out <file>          Write the JSON report here (default: fir-<host>-<date>.json)
  --dry-run             Crawl and match pages to tasks, without calling an LLM
  -h, --help            Show this help

Environment
  OPENAI_API_KEY        Required unless --dry-run`;

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '-h' || x === '--help') a.help = true;
    else if (x === '--dry-run') a.dryRun = true;
    else if (x.startsWith('--')) a[x.slice(2)] = argv[++i];
    else a._.push(x);
  }
  return a;
}

const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args._[0]) { console.log(HELP); process.exit(args.help ? 0 : 1); }

  let url = args._[0];
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!args.dryRun && !apiKey) { console.error('OPENAI_API_KEY is not set. Set it, or use --dry-run.'); process.exit(1); }

  const tasks = await loadTasks(args.tasks || fileURLToPath(new URL('../tasks/ecommerce.json', import.meta.url)));
  const report = await audit(url, tasks, {
    maxPages: Number(args['max-pages'] || 40),
    delayMs: Number(args.delay || 1000),
    threshold: Number(args.threshold || 0.6),
    dryRun: Boolean(args.dryRun),
    llm: { apiKey, model: args.model || process.env.FIR_MODEL || 'gpt-4o-mini', baseUrl: args['base-url'] || process.env.FIR_BASE_URL },
    log: (m) => console.error(m),
  });

  console.log('');
  if (report.summary) {
    const s = report.summary;
    console.log(`Failed Intent Rate  ${pct(s.fir).trim()}   ${s.failed} of ${s.total} intents failed   ${url}\n`);
    for (const r of report.results) {
      const failed = !r.fulfilled || r.confidence < s.threshold;
      console.log(`  ${failed ? '✗' : '✓'} ${r.id.padEnd(16)} ${r.reason}`);
    }
    console.log('\nBy intent');
    for (const [k, v] of Object.entries(s.byIntent)) console.log(`  ${k.padEnd(18)} ${pct(v.fir)}  (${v.failed}/${v.total})`);
  } else {
    for (const r of report.results) console.log(`  ${r.id.padEnd(16)} ${r.candidates[0] || '(no matching page)'}`);
  }

  const host = new URL(url).host.replace(/^www\./, '');
  const out = args.out || `fir-${host}-${report.auditedAt.slice(0, 10)}.json`;
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${out}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
