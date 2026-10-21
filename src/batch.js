import { audit } from './audit.js';

// Audits sites one after another (never in parallel: politeness first) and
// returns one summary row per site. A site that errors does not stop the run.
export async function runBatch(sites, tasks, opts = {}, { onReport = async () => {}, log = () => {} } = {}) {
  const rows = [];
  for (const [i, site] of sites.entries()) {
    log(`\n[${i + 1}/${sites.length}] ${site.name}`);
    const row = { name: site.name, url: site.url, country: site.country || '', type: site.type || '', size: site.size || '' };
    try {
      const report = await audit(site.url, tasks, { ...opts, log });
      await onReport(site, report);
      row.status = report.access.status;
      row.pages = report.crawl.pagesFetched;
      row.service_pages = report.crawl.servicePages?.length ?? 0;
      row.tasks_matched = report.results.filter((r) => r.candidates?.length).length;
      row.tasks_total = tasks.length;
      if (report.summary) Object.assign(row, { fir: report.summary.fir, failed: report.summary.failed });
      row.note = report.access.reason || report.warnings?.[0] || '';
    } catch (e) {
      Object.assign(row, { status: 'error', pages: 0, note: e.message });
    }
    rows.push(row);
  }
  return rows;
}

const COLUMNS = ['name', 'url', 'country', 'type', 'size', 'status', 'pages', 'service_pages', 'tasks_matched', 'tasks_total', 'fir', 'failed', 'note'];

export function toCsv(rows) {
  const cell = (v) => {
    const s = v === undefined || v === null ? '' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
