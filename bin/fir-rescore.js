#!/usr/bin/env node
// fir-rescore <report-dir> [--out <dir>]: apply the current rules to a stored run.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rescore } from '../src/rescore.js';
import { toCsv } from '../src/batch.js';

const [dir, ...rest] = process.argv.slice(2);
if (!dir) { console.log('Usage: fir-rescore <report-dir> [--out <dir>]'); process.exit(1); }
const out = rest[rest.indexOf('--out') + 1] && rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : `${dir}-rescored`;
await mkdir(out, { recursive: true });

const prev = Object.fromEntries((await readFile(join(dir, 'summary.csv'), 'utf8')).trim().split('\n').slice(1)
  .map((l) => l.split(',')).map((c) => [c[1], c]));
const rows = [];
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json')).sort()) {
  const r = rescore(JSON.parse(await readFile(join(dir, f), 'utf8')));
  await writeFile(join(out, f), JSON.stringify(r, null, 2));
  const p = prev[r.site] || [];
  rows.push({
    name: p[0] || r.site, url: r.site, country: p[2], type: p[3], size: p[4],
    status: r.access.status, pages: r.crawl.pagesFetched, service_pages: r.crawl.servicePages?.length ?? 0,
    tasks_matched: r.results.filter((x) => x.candidates?.length).length, tasks_total: r.results.length || '',
    fir: r.summary?.fir, failed: r.summary?.failed, note: r.access.reason || '',
  });
}
const order = Object.keys(prev);
rows.sort((a, b) => order.indexOf(a.url) - order.indexOf(b.url));
await writeFile(join(out, 'summary.csv'), toCsv(rows));
for (const r of rows) console.log(`${String(r.name).slice(0, 18).padEnd(18)} ${r.status.padEnd(16)} help=${String(r.service_pages).padStart(2)}  ${r.fir === undefined ? '' : Math.round(r.fir * 100) + '%'}`);
console.log(`\nRescored: ${out}`);
