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
