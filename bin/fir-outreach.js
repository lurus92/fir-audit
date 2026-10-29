#!/usr/bin/env node
// fir-outreach <run-dir> --sites <sites.json> [--access a.csv b.csv ...] [--notes notes.json]
//              [--template templates/outreach-en.json] [--out outreach/<date>]
//              [--runs <extra-audit.json> ...]
// Writes one <site>.md per shop (subject + body) and outreach.csv for mail merge.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildEmail } from '../src/outreach.js';

const argv = process.argv.slice(2);
const dir = argv[0];
const list = (flag) => { const i = argv.indexOf(flag); if (i < 0) return []; const out = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(argv[j]); return out; };
const one = (flag, dflt) => list(flag)[0] ?? dflt;
if (!dir || dir.startsWith('--')) {
  console.log('Usage: fir-outreach <run-dir> --sites <sites.json> [--access <csv> ...] [--notes <json>] [--template <json>] [--out <dir>]');
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = lines[0].split(sep);
  return lines.slice(1).map((l) => Object.fromEntries(l.split(sep).map((v, i) => [head.at(i), v])));
}

const template = JSON.parse(await readFile(one('--template', 'templates/outreach-en.json'), 'utf8'));
const sitesFile = one('--sites');
const sites = sitesFile ? JSON.parse(await readFile(sitesFile, 'utf8')).sites : [];
// Display name without our internal country tag ("XXXLutz AT" -> "XXXLutz").
const nameOf = (url) => sites.find((s) => new URL(s.url).host === new URL(url).host)?.name?.replace(/ (CH|DE|AT|UK|UAE)$/, '');
const accessRows = [];
const accessDates = [];
for (const f of list('--access')) {
  accessRows.push(...parseCsv(await readFile(f, 'utf8')));
  const d = f.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (d) accessDates.push(`${d}T12:00:00.000Z`);
}
// Extra full-audit runs of a site (e.g. a re-audit) count as access checks too.
for (const f of list('--runs')) {
  const r = JSON.parse(await readFile(f, 'utf8'));
  accessRows.push({ url: r.site.replace(/\/$/, ''), crawler: r.access.status === 'blocked' ? 'blocked' : 'ok' });
  accessDates.push(r.auditedAt);
}
const notesFile = one('--notes');
const notes = notesFile ? JSON.parse(await readFile(notesFile, 'utf8')) : [];
const out = one('--out', `outreach/${new Date().toISOString().slice(0, 10)}`);
await mkdir(out, { recursive: true });

const rows = [];
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json')).sort()) {
  const report = JSON.parse(await readFile(join(dir, f), 'utf8'));
  if (!report.site || !report.access) continue;
  const e = buildEmail(report, { template, shopName: nameOf(report.site), accessRows, accessDates, notes });
  await writeFile(join(out, `${e.site}.md`), `Subject: ${e.subject}\n\n${e.body}\n`);
  rows.push(e);
}
const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
await writeFile(join(out, 'outreach.csv'), ['site,shop,state,first_name,email,subject,body', ...rows.map((e) => [e.site, e.shop, e.state, '', '', e.subject, e.body].map(cell).join(','))].join('\n') + '\n');
for (const e of rows) console.log(`${e.shop.padEnd(18)} ${e.state.padEnd(16)} ${e.failures.join(', ')}`);
console.log(`\n${rows.length} emails in ${out}/ (one .md per shop + outreach.csv). Fill first_name and email before sending.`);
