// Picks the pages most likely to fulfil a task (TF-IDF over title, URL, text),
// so the judge only sees a few excerpts per task.
const STOP = new Set('the and for you your are can how what with does from this that have will our who where when which into about any get'.split(' '));

export function tokenize(s) {
  return (String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((t) => t.length > 2 && !STOP.has(t));
}

export function rankPages(task, pages, k = 3) {
  const terms = [...new Set(tokenize(`${task.task} ${(task.keywords || []).join(' ')}`))];
  const docs = pages.map((p) => ({ page: p, title: tokenize(p.title), url: tokenize(p.url), text: tokenize(p.text) }));
  const df = Object.fromEntries(terms.map((t) => [t, docs.filter((d) => d.text.includes(t) || d.title.includes(t) || d.url.includes(t)).length]));
  const count = (arr, t) => arr.reduce((n, x) => n + (x === t), 0);
  return docs
    .map((d) => {
      const score = terms.reduce((s, t) => {
        const tf = 3 * count(d.title, t) + 2 * count(d.url, t) + count(d.text, t);
        return s + (tf ? (1 + Math.log(tf)) * Math.log(1 + docs.length / (1 + df[t])) : 0);
      }, 0);
      return { ...d.page, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// The parts of a page most relevant to a task, in page order, within a budget.
// Policy pages are long; the answer is rarely in the first paragraph.
export function excerpt(text, task, budget = 3000, window = 500) {
  if (!text || text.length <= budget) return text || '';
  const terms = [...new Set(tokenize(`${task.task} ${(task.keywords || []).join(' ')}`))];
  const chunks = [];
  for (let i = 0; i < text.length; i += window) chunks.push({ i, t: text.slice(i, i + window) });
  const scored = chunks.map((c) => {
    const low = c.t.toLowerCase();
    return { ...c, s: terms.reduce((n, t) => n + low.split(t).length - 1, 0) };
  });
  const keep = new Set();
  let used = 0;
  for (const c of [...scored].sort((a, b) => b.s - a.s || a.i - b.i)) {
    if (used + c.t.length > budget) break;
    if (c.s === 0 && keep.size) break;
    keep.add(c.i);
    used += c.t.length;
  }
  return scored.filter((c) => keep.has(c.i)).map((c) => c.t).join(' … ');
}
