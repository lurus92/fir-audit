#!/usr/bin/env node
// fir-validate sample <report-dir> [--n 50]   -> <report-dir>/validation.csv to fill in
// fir-validate score  <validation.csv>        -> agreement between judge and human
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sampleVerdicts, agreement } from '../src/validate.js';
import { applyHumanVerdicts } from '../src/finalize.js';
import { toCsv } from '../src/batch.js';
import { mkdir } from 'node:fs/promises';

const [cmd, target, ...rest] = process.argv.slice(2);
const n = Number(rest[rest.indexOf('--n') + 1]) || 50;
const COLS = ['n', 'site', 'task_id', 'task', 'judge', 'confidence', 'evidence_url', 'evidence_quote', 'reason', 'pages_shown', 'human', 'note'];
const cell = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Excel re-saves CSVs with ";" in DACH locales and drops quoting, so the
// delimiter is detected from the header line, never assumed.
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.slice(0, text.indexOf('\n'));
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(f); f = ''; }
    else if (ch === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x !== ''));
  return body.map((r) => Object.fromEntries(head.map((k, i) => [k.trim(), r[i] ?? ''])));
}

if (cmd === 'sample' && target) {
  const files = (await readdir(target)).filter((f) => f.endsWith('.json'));
  const reports = [];
  for (const f of files) {
    const r = JSON.parse(await readFile(join(target, f), 'utf8'));
    if (r.summary) reports.push(r);
  }
  const rows = sampleVerdicts(reports, n);
  const out = join(target, 'validation.csv');
  await writeFile(out, [COLS.join(','), ...rows.map((r) => COLS.map((c) => cell(r[c])).join(','))].join('\n') + '\n');
  const p = rows.filter((r) => r.judge === 'pass').length;
  console.log(`${rows.length} verdicts sampled (${p} passes, ${rows.length - p} failures) from ${reports.length} scored sites.`);
  console.log(`Open ${out}, check each evidence_url against the task, and write pass or fail in the "human" column.`);
} else if (cmd === 'score' && target) {
  const a = agreement(parseCsv(await readFile(target, 'utf8')));
  if (!a.total) { console.log('No rows with pass/fail in the "human" column yet.'); process.exit(1); }
  console.log(`Checked: ${a.total}`);
  console.log(`Agreement: ${Math.round(a.agreement * 100)}%   Cohen's kappa: ${a.kappa.toFixed(2)}`);
  console.log(`Judge passed, human failed: ${a.false_pass}   Judge failed, human passed: ${a.false_fail}`);
} else if (cmd === 'apply' && target) {
  // fir-validate apply <report-dir> <validation.csv> [more.csv ...]  ->  <report-dir>-final
  const csvs = rest.filter((x) => x.endsWith('.csv'));
  const labels = [];
  for (const c of csvs) labels.push(...parseCsv(await readFile(c, 'utf8')));
  const files = (await readdir(target)).filter((f) => f.endsWith('.json')).sort();
  const reports = [];
  for (const f of files) reports.push(JSON.parse(await readFile(join(target, f), 'utf8')));
  const final = applyHumanVerdicts(reports, labels);
  const out = `${target.replace(/\/$/, '')}-final`;
  await mkdir(out, { recursive: true });
  const rows = [];
  for (const [i, r] of final.entries()) {
    await writeFile(join(out, files[i]), JSON.stringify(r, null, 2));
    rows.push({ name: new URL(r.site).host.replace(/^www\./, ''), url: r.site, status: r.access.status, pages: r.crawl.pagesFetched,
      service_pages: r.crawl.servicePages?.length ?? 0, tasks_matched: r.results.filter((x) => x.candidates?.length).length,
      tasks_total: r.results.length || '', fir: r.summary?.fir, failed: r.summary?.failed,
      note: r.verification ? `${r.verification.failures_human_confirmed}/${r.verification.failures_total} failures human-confirmed` : (r.access.reason || '') });
  }
  await writeFile(join(out, 'summary.csv'), toCsv(rows));
  const v = final.filter((r) => r.verification);
  const sum = (k) => v.reduce((n, r) => n + r.verification[k], 0);
  console.log(`Applied ${labels.length} human labels to ${v.length} scored sites.`);
  console.log(`Failures: ${sum('failures_total')}, human-confirmed: ${sum('failures_human_confirmed')}. Human-checked results: ${sum('human_checked')}.`);
  console.log(`Final: ${out}`);
} else {
  console.log('Usage:\n  fir-validate sample <report-dir> [--n 50]\n  fir-validate score <validation.csv>\n  fir-validate apply <report-dir> <validation.csv> [more.csv ...]');
  process.exit(1);
}
