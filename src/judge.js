// Asks an LLM whether the retrieved page excerpts let a visitor complete the
// task. Works with any OpenAI-compatible Chat Completions endpoint.
const SYSTEM = `You audit whether a website's public content lets a visitor complete a task.
Use ONLY the page excerpts provided. Do not use outside knowledge about the company.
The task is fulfilled only if the excerpts contain a specific, usable answer
(a policy, a number, a contact route, a step-by-step path), not a vague mention.
Reply with JSON only:
{"fulfilled": boolean, "confidence": number between 0 and 1,
 "evidence_url": string or null, "answer": string (max 200 chars),
 "reason": string (max 200 chars, why it passed or failed)}`;

export async function judge(task, candidates, { apiKey, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1', fetchImpl = fetch } = {}) {
  if (!candidates.length) {
    return { fulfilled: false, confidence: 1, evidence_url: null, answer: '', reason: 'No crawled page matched this task.' };
  }
  const excerpts = candidates.map((p, i) => `[${i + 1}] ${p.url}\nTitle: ${p.title}\n${p.text.slice(0, 3000)}`).join('\n\n');
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
  return {
    fulfilled: Boolean(out.fulfilled),
    confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0)),
    evidence_url: out.evidence_url || null,
    answer: String(out.answer || ''),
    reason: String(out.reason || ''),
  };
}
