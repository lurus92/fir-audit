import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBatch, toCsv } from '../src/batch.js';
import { fakeSite } from './helpers.js';

test('batch keeps going past blocked and broken sites, and summarises each', async () => {
  const good = fakeSite({ '/robots.txt': '', '/': '<title>Shop</title><a href="/rueckgabe">Rückgabe</a>', '/rueckgabe': '<title>Rückgabe</title><p>30 Tage Rückgaberecht. Weitere Informationen zu Fristen, Kosten und Ablauf findest du in unseren Servicebedingungen. Weitere Informationen zu Fristen, Kosten und Ablauf findest du in unseren Servicebedingungen. Weitere Informationen zu Fristen, Kosten und Ablauf findest du in unseren Servicebedingungen.</p>' });
  const fetchImpl = async (url, init) => {
    const host = new URL(url).host;
    if (host === 'blocked.test') return { ok: false, status: 403, headers: { get: () => 'text/html' }, text: async () => '' };
    if (host === 'broken.test') throw new Error('ENOTFOUND');
    return good.fetchImpl(url, init);
  };
  const sites = [
    { name: 'Good', url: 'https://good.test/' },
    { name: 'Blocked', url: 'https://blocked.test/' },
    { name: 'Broken', url: 'https://broken.test/' },
  ];
  const tasks = [{ id: 'r', task: 'Wie lange ist die Rückgabe möglich?', intent: 'Support', keywords: ['rückgabe'] }];
  const reports = [];
  const rows = await runBatch(sites, tasks, { delayMs: 0, minPages: 1, dryRun: true, fetchImpl }, { onReport: async (s, r) => reports.push(r) });

  assert.deepEqual(rows.map((r) => r.status), ['ok', 'blocked', 'unreachable']);
  assert.equal(rows[0].pages, 2);
  assert.equal(rows[0].tasks_matched, 1);
  assert.equal(reports.length, 3);
  const csv = toCsv(rows);
  assert.match(csv.split('\n')[0], /^name,url,country/);
  assert.equal(csv.trim().split('\n').length, 4);
});
