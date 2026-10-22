// Asks an LLM whether the retrieved page excerpts let a visitor complete the
// task. Works with any OpenAI-compatible Chat Completions endpoint.
import { excerpt } from './retrieve.js';
import { decodeEntities } from './html.js';

const norm = (x) => decodeEntities(String(x || '')).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// The judge often joins non-adjacent passages with "..." (22 Oct run: 15 of 15
// rejected quotes were real text stitched this way). Each fragment must appear
// in the excerpts; a fragment of 3+ words may differ by at most 20% of its
// 3-word sequences (the judge trims clauses), never be invented.
export function verifyQuote(quote, text) {
  if (!quote) return false;
  const t = norm(text);
  const frags = String(quote).split(/\.{3,}|…/).map(norm).filter((f) => f.length >= 3);
  if (!frags.length) return false;
  return frags.every((f) => {
    if (t.includes(f)) return true;
    const w = f.split(' ');
    if (w.length < 5) return false;
    const grams = w.length - 2;
    let hit = 0;
    for (let i = 0; i < grams; i++) if (t.includes(w.slice(i, i + 3).join(' '))) hit += 1;
    return hit / grams >= 0.8;
  });
}

const SYSTEM = `You audit whether a website's public content lets a visitor complete a task.
Use ONLY the page excerpts provided. Do not use outside knowledge about the company.
Pages may be in German, French, Italian or English; the task does not need to
be in the same language as the page. Write your reason in English.
The task is fulfilled only if the excerpts contain a specific, usable answer
(a policy, a number, a contact route, a step-by-step path), not a vague mention.
The answer must be about exactly what was asked: a product warranty, not a
credit-card insurance; payment methods for placing an order, not how refunds
are paid back; this shop's delivery countries, not a mention of a country.
If you would have to infer or guess, it is not fulfilled.
If fulfilled, evidence_quote must be copied verbatim from the excerpts, in the
page's language, at most 30 words.
Reply with JSON only:
{"fulfilled": boolean, "confidence": number between 0 and 1,
 "evidence_url": string or null, "evidence_quote": string or null,
 "answer": string (max 200 chars),
 "reason": string (max 200 chars, why it passed or failed)}`;

export async function judge(task, candidates, { apiKey, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1', fetchImpl = fetch } = {}) {
  if (!candidates.length) {
    return { fulfilled: false, confidence: 1, evidence_url: null, answer: '', reason: 'No crawled page matched this task.' };
  }
  const passages = candidates.map((p) => excerpt(p.text, task));
  const excerpts = candidates.map((p, i) => `[${i + 1}] ${p.url}\nTitle: ${p.title}\n${passages[i]}`).join('\n\n');
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Task: ${task.task}\n\nPage excerpts:\n\n${excerpts}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const out = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  // A pass must be backed by a quote that really is in what the judge was shown.
  const quote = out.evidence_quote ? String(out.evidence_quote) : null;
  const quoteFound = verifyQuote(quote, passages.join(' '));
  const fulfilled = Boolean(out.fulfilled) && quoteFound;
  return {
    fulfilled,
    confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0)),
    evidence_url: out.evidence_url || null,
    evidence_quote: quote,
    quote_verified: quoteFound,
    answer: String(out.answer || ''),
    reason: Boolean(out.fulfilled) && !quoteFound
      ? `Judged answered, but its evidence quote is not in the page text; counted as not fulfilled. (${String(out.reason || '')})`
      : String(out.reason || ''),
    excerpts: candidates.map((p, i) => ({ url: p.url, text: passages[i] })),
  };
}
