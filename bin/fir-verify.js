#!/usr/bin/env node
// fir-verify <report-dir>: run the quote-only verifier on every pass of a
// stored run (one LLM call per pass), write <report-dir>-verified.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withVerifier } from '../src/judge.js';
import { failedIntentRate } from '../src/score.js';

const dir = process.argv[2]?.replace(/\/$/, '');
if (!dir) { console.log('Usage: fir-verify <report-dir>'); process.exit(1); }
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) { console.error('OPENAI_API_KEY is not set.'); process.exit(1); }
const llm = { apiKey, model: process.env.FIR_MODEL || 'gpt-4o-mini', baseUrl: process.env.FIR_BASE_URL || 'https://api.openai.com/v1' };
const out = `${dir}-verified`;
await mkdir(out, { recursive: true });

let checked = 0; let rejected = 0;
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json')).sort()) {
  const r = JSON.parse(await readFile(join(dir, f), 'utf8'));
  if (r.summary) {
    const results = [];
    for (const x of r.results) {
      const pass = x.fulfilled && x.confidence >= (r.settings?.threshold ?? 0.6);
      if (!pass || x.verifier) { results.push(x); continue; }
      const v = await withVerifier(x, x.task, llm);
      checked += 1;
      if (v.verifier === 'rejected') { rejected += 1; console.log(`  rejected  ${f.replace('.json', '')} ${x.id}: ${v.reason.slice(0, 110)}`); }
      results.push(v);
    }
    r.results = results;
    r.summary = failedIntentRate(results, r.settings?.threshold ?? 0.6);
  }
  await writeFile(join(out, f), JSON.stringify(r, null, 2));
}
console.log(`\nVerified ${checked} passes, rejected ${rejected}. Output: ${out}`);
