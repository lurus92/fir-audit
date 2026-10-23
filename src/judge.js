// Asks an LLM whether the retrieved page excerpts let a visitor complete the
// task. Works with any OpenAI-compatible Chat Completions endpoint.
import { excerpt } from './retrieve.js';
import { decodeEntities } from './html.js';

const norm = (x) => decodeEntities(String(x || '')).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Is the judge's evidence quote really in the page? The judge stitches
// passages with "...", drops clauses ("Brack AG [bzw. der Lieferant]
// übernimmt") and reorders a sentence ("Lieferzeit nach dem Versand beträgt" /
// "beträgt die Lieferzeit nach dem Versand"); markup can split a word
// ("L ieferung"). Each fragment must be found exactly, or ≥90% of its words
// must occur together within a short span of the page. Invented content (a
// number, a scope like "alle Produkte") fails.
export function verifyQuote(quote, text) {
  if (!quote) return false;
  const t = norm(text);
  const tWords = t.split(' ');
  const despaced = t.replace(/ /g, '');
  const frags = String(quote).split(/\.{3,}|…/).map(norm).filter((f) => f.length >= 3);
  if (!frags.length) return false;
  return frags.every((f) => {
    if (t.includes(f) || despaced.includes(f.replace(/ /g, ''))) return true;
    const words = [...new Set(f.split(' '))];
    if (words.length < 4) return false;
    const need = Math.ceil(words.length * 0.9);
    const span = Math.max(words.length * 2, words.length + 8);
    const want = new Set(words);
    for (let s = 0; s + 1 <= tWords.length; s += 1) {
      if (!want.has(tWords[s])) continue;
      const seen = new Set(tWords.slice(s, s + span).filter((w) => want.has(w)));
      if (seen.size >= need) return true;
    }
    // A word split by markup: count it if its despaced form is in the span-free text.
    const found = words.filter((w) => tWords.includes(w) || (w.length >= 6 && despaced.includes(w))).length;
    return found >= need && words.length >= 8 && t.includes(words.slice(0, 2).join(' '));
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
A restrictive answer IS an answer: "we deliver only within Germany", "no
invoice payment", "returns are not free" all fulfil the task.
If fulfilled, evidence_quote must be copied verbatim from the excerpts, in the
page's language, at most 30 words.
Reply with JSON only:
{"fulfilled": boolean, "confidence": number between 0 and 1,
 "evidence_url": string or null, "evidence_quote": string or null,
 "answer": string (max 200 chars),
 "reason": string (max 200 chars, why it passed or failed)}`;

// Second, independent check on every pass: the verifier sees ONLY the task and
// the quote, never the page. It is deliberately narrow: a first version that
// also demanded every part of two-part questions disagreed with the human
// labels on 16 of 18 cases (23 Oct). Catches the two false-pass patterns found in human
// validation: a quote unrelated to the task (a warranty sentence cited for
// "how to contact support") and a vague reference ("payment methods as shown
// on the website").
const VERIFIER = `You check evidence for a website audit. You get a visitor's question and
one quote from the website. Decide whether the quote gives a specific, usable
answer to the core of the question.
Reject ONLY when:
- the quote is about a different topic (e.g. a sentence about warranty
  extensions cited for "how do I contact customer service"), or
- the quote points elsewhere instead of answering ("with the payment methods
  shown on the website", "see our FAQ", "visit the help centre").
Do NOT reject because the question has two parts and the quote answers one of
them: "2 years warranty" answers a warranty question; "phone Mon-Fri 8-17"
answers a contact question. Restrictive answers ("only within Switzerland",
"not possible") are answers.
Reply with JSON only: {"answers": boolean, "reason": string (max 150 chars)}`;

async function chat(messages, { apiKey, model, baseUrl, fetchImpl }) {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

export async function verifyPass(taskText, quote, { apiKey, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1', fetchImpl = fetch } = {}) {
  const out = await chat([
    { role: 'system', content: VERIFIER },
    { role: 'user', content: `Question: ${taskText}\n\nQuote: ${quote}` },
  ], { apiKey, model, baseUrl, fetchImpl });
  return { answers: Boolean(out.answers), reason: String(out.reason || '') };
}

// Apply the verifier to a judged result; a rejected pass becomes a failure.
export async function withVerifier(result, taskText, llm) {
  if (!result.fulfilled) return result;
  const v = await verifyPass(taskText, result.evidence_quote, llm);
  if (v.answers) return { ...result, verifier: 'confirmed' };
  return { ...result, fulfilled: false, verifier: 'rejected', reason: `Quote does not answer the task on its own: ${v.reason} (judge: ${result.reason})` };
}

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
