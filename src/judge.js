// Asks an LLM whether the retrieved page excerpts let a visitor complete the
// task. Works with any OpenAI-compatible Chat Completions endpoint.
import { excerpt } from './retrieve.js';

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
  const norm = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const quote = out.evidence_quote ? String(out.evidence_quote) : null;
  const quoteFound = Boolean(quote) && norm(passages.join(' ')).includes(norm(quote));
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
