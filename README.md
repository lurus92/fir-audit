# fir-audit

**How often does your website fail the people (and AI agents) who come to it with a question?**

`fir-audit` measures a website's **Failed Intent Rate (FIR)**: the share of common visitor intents the site cannot fulfil from its own public content. Point it at a URL, give it a list of things real visitors try to do ("what's your return policy?", "do you ship to Switzerland?"), and it tells you which ones your site answers, which ones it doesn't, and where the evidence is.

```
$ npx fir-audit shop.example.com

Failed Intent Rate  40%   4 of 10 intents failed   https://shop.example.com

  ✓ returns          Policy page states a 30-day return window with free returns.
  ✗ shipping-intl    Shipping page lists EU countries only; Switzerland not mentioned.
  ✓ delivery-time    Standard delivery is 2–4 working days.
  ✓ payment          Card, PayPal and Klarna listed at checkout help page.
  ✗ contact          Contact form found, but no support hours or phone/email route.
  ✓ track-order      Tracking explained in Help > Orders.
  ✗ warranty         No warranty or guarantee information on any crawled page.
  ✓ size-guide       Size guide linked from product pages.
  ✓ discounts        10% first-order code via newsletter.
  ✗ stores           No crawled page matched this task.

By intent
  Support             33%  (1/3)
  Pricing              0%  (0/2)
  ...

Report: fir-shop.example.com-2026-10-21.json
```
<sub>Illustrative output on a fictional site.</sub>

## Why this exists

Analytics tells you what visitors *did*. It is almost blind to what they *came for and didn't get*. A visitor who can't find your return policy doesn't file a bug. They leave, and your dashboard records a bounce.

That gap is getting bigger, because a growing share of "visitors" are now AI assistants and agents reading your site on someone's behalf. An agent that can't find your shipping policy doesn't scroll harder. It tells the user "I couldn't find that" and recommends someone else.

**FIR puts a number on that gap.**

## The metric

```
FIR = intents the site could not fulfil / intents attempted
```

An intent counts as **failed** when the site's content doesn't contain a specific, usable answer, or when the answer found falls below a confidence threshold (default `0.6`). A vague mention ("contact us for details") is a failure, not a pass.

FIR started inside [AskVio](https://askvio.app), where it is measured from real visitor questions: the share the site's assistant could not answer with confidence. `fir-audit` measures the same thing **from the outside**, with no access to the site's data, so any site can be measured and any two sites can be compared.

## Quickstart

Requires Node.js 20+. No dependencies.

```bash
export OPENAI_API_KEY=sk-...
npx fir-audit https://your-site.com
```

Or from source:

```bash
git clone https://github.com/lurus92/fir-audit && cd fir-audit
node bin/fir-audit.js https://your-site.com
```

Try it without an API key: `--dry-run` crawls the site and shows which page would be used to answer each task, without calling an LLM.

| Option | Default | |
|---|---|---|
| `--tasks <file>` | `tasks/ecommerce.json` | The intents to test |
| `--max-pages <n>` | `40` | Crawl budget |
| `--threshold <0-1>` | `0.6` | Confidence below which an intent fails |
| `--model <name>` | `gpt-4o-mini` | Any model on an OpenAI-compatible API |
| `--base-url <url>` | OpenAI | For Azure, OpenRouter, local models, etc. |
| `--out <file>` | `fir-<host>-<date>.json` | Full JSON report with evidence |
| `--dry-run` | | No LLM calls |

## Audit many sites

```bash
node bin/fir-batch.js sites/dach-pilot.json --tasks tasks/dach-ecommerce.json --dry-run
```

Sites are audited one at a time, never in parallel. Each gets a JSON report, and `summary.csv` holds one row per site. A site lands in one of three states:

- **ok**: crawled and scored
- **blocked**: the site refused the crawler (401/403/429 or robots.txt). Recorded, never scored
- **unreachable**: DNS, timeout or server errors. Says nothing about the site's policy

Included: `sites/dach-pilot.json` (20 DACH shops) with `tasks/dach-ecommerce.json` (10 intents, German and English keywords).

## How it works

1. **Crawl, politely.** Same-site pages only, `robots.txt` respected (including `Crawl-delay`), at most one request per second by default, identified as `fir-audit/0.1 (+https://github.com/lurus92/fir-audit)`. Links that match the tasks' keywords are fetched first, so a small page budget covers the pages that matter.
2. **Retrieve.** For each task, rank crawled pages by relevance and keep the top 3.
3. **Judge.** An LLM reads only those excerpts (no outside knowledge about the company) and decides whether a visitor could complete the task, with a confidence score, the evidence URL, and a one-line reason.
4. **Score.** FIR overall and per intent category, plus every verdict and its evidence in the JSON report, so any result can be checked by hand.

## Write your own tasks

A task suite is a JSON file. Write the intents your visitors actually have.

```json
{
  "name": "SaaS baseline",
  "tasks": [
    { "id": "pricing", "task": "How much does the Pro plan cost per month?", "keywords": ["pricing", "plans"] },
    { "id": "sso", "task": "Do you support SAML single sign-on?", "keywords": ["sso", "saml", "security"] }
  ]
}
```

`intent` is optional. Tasks are categorised automatically (Pricing, Support, Documentation, Product research, General) using the same classifier as AskVio, so outside-in and in-product FIR are comparable.

## What it does not do (yet)

Be careful with the numbers, and read this before you quote one.

- **Static HTML only.** v0 reads server-rendered HTML. Content that only appears after JavaScript runs, inside a chat widget, or behind a login is invisible to it, and counts as not found. On JavaScript-heavy sites, FIR will be overstated.
- **Findability, not task completion.** v0 checks whether the answer *exists and can be found* in public pages. It does not yet try to *complete* a task (add to cart, fill a form).
- **The LLM is the judge.** Verdicts are deterministic per run (`temperature: 0`) but model-dependent. Report the model with any number you publish. The JSON report keeps the evidence so verdicts can be audited.
- **Crawl budget matters.** A 40-page crawl of a 10,000-page site is a sample. Increase `--max-pages` for real audits.

## Roadmap

- [ ] **Agent mode:** a real browser agent (Playwright) that renders JavaScript, uses on-site search and tries to complete tasks, not just find answers
- [ ] **WebMCP detection:** check whether a site exposes tools to AI agents via `document.modelContext`, and whether using them lowers FIR
- [ ] More task suites: SaaS, travel, telco, banking
- [ ] Batch mode and a benchmark across many sites
- [ ] HTML report

## Responsible use

Audit sites you own, sites you have permission to audit, or public sites at low volume for research. Keep the defaults (robots.txt, 1 request/second, honest user agent). Don't use this to hammer anyone's servers, and don't present one automated run as a definitive verdict on a company.

## Author

Built by **[Luigi Russo](https://lrusso.it)**, who originated the Failed Intent Rate. Also building [AskVio](https://askvio.app), which measures FIR from real visitor questions and helps sites close the gaps.

Issues, task suites and pull requests are welcome.

## License

MIT
