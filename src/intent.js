// Intent categories, from AskVio (functions/utils/intentClassifier.js), so
// outside-in audits and AskVio's in-product FIR use the same buckets.
const INTENT_RULES = [
  { intent: 'Pricing', patterns: [/\bpric(e|es|ing)\b/i, /\bcost(s)?\b/i, /\bplan(s)?\b/i, /\bsubscri(ption|be|bing)\b/i, /\bbilling\b/i, /\bfee(s)?\b/i, /\bdiscount(s)?\b/i, /\btier(s)?\b/i, /\bfree trial\b/i, /\bhow much\b/i, /\bafford/i] },
  { intent: 'Support', patterns: [/\berror(s)?\b/i, /\bissue(s)?\b/i, /\bproblem(s)?\b/i, /\bnot working\b/i, /\bbroken\b/i, /\bfix\b/i, /\btroubleshoot/i, /\bfail(s|ed|ing)?\b/i, /\bcrash/i, /\bcan'?t\b/i, /\bunable to\b/i, /\bwon'?t\b/i] },
  { intent: 'Documentation', patterns: [/\bhow (to|do|does|can|should)\b/i, /\bguide\b/i, /\btutorial\b/i, /\bstep(s| by)\b/i, /\bsetup\b/i, /\binstall/i, /\bconfigur/i, /\bdocument(ation|s)?\b/i, /\bexplain\b/i, /\bwhat is\b/i, /\bwhat are\b/i, /\bget started\b/i] },
  { intent: 'Product research', patterns: [/\bfeature(s)?\b/i, /\bcompar(e|ison|ing)\b/i, /\bvs\.?\b/i, /\balternative(s)?\b/i, /\brecommend/i, /\bwhich\b/i, /\bdoes it\b/i, /\bdo you (offer|have|support)\b/i, /\bavailab(le|ility)\b/i, /\bintegrat(e|ion|ions)\b/i] },
];

export function classifyIntent(text) {
  for (const { intent, patterns } of INTENT_RULES) if (patterns.some((p) => p.test(String(text || '')))) return intent;
  return 'General';
}
