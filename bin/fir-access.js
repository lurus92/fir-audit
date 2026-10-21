#!/usr/bin/env node
// fir-access <sites.json> [more.json ...]: what each site tells AI agents in
// robots.txt, and how it responds to an honestly identified crawler.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { AI_AGENTS, checkAccess } from '../src/access.js';

const files = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (!files.length || process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log('Usage: fir-access <sites.json> [more.json ...]\nWrites reports/access-<date>.csv');
  process.exit(files.length ? 0 : 1);
}

const sites = [];
for (const f of files) {
  const list = JSON.parse(await readFile(f, 'utf8'));
  for (const s of Array.isArray(list) ? list : list.sites) sites.push({ ...s, list: basename(f, '.json') });
}

const rows = [];
for (const [i, site] of sites.entries()) {
  const row = { list: site.list, ...(await checkAccess(site)) };
  rows.push(row);
  const blockedAgents = AI_AGENTS.filter((a) => row[a.token] === 'disallowed').length;
  console.error(`[${i + 1}/${sites.length}] ${site.name.padEnd(18)} crawler=${row.crawler.padEnd(11)} AI agents disallowed=${blockedAgents}/${AI_AGENTS.length}`);
  await new Promise((r) => setTimeout(r, 1000));
}

const cols = ['list', 'name', 'url', 'country', 'type', 'size', 'crawler', 'homepage', 'robots', ...AI_AGENTS.map((a) => a.token)];
const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
await mkdir('reports', { recursive: true });
const out = `reports/access-${new Date().toISOString().slice(0, 10)}.csv`;
await writeFile(out, [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n');

console.log('\nAgent            disallowed  restricted');
for (const a of AI_AGENTS) {
  const d = rows.filter((r) => r[a.token] === 'disallowed').length;
  const x = rows.filter((r) => r[a.token] === 'restricted').length;
  console.log(`${a.token.padEnd(18)} ${String(d).padStart(6)}/${rows.length}  ${String(x).padStart(6)}`);
}
console.log(`\nReport: ${out}`);
