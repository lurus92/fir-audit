import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHtml } from '../src/html.js';
import { excerpt } from '../src/retrieve.js';
import { judge } from '../src/judge.js';

const MENU = '<nav>' + Array.from({ length: 400 }, (_, i) => `<a href="/c/${i}">Kategorie ${i}</a>`).join('') + '</nav>';

test('site chrome is stripped and <main> preferred', () => {
  const html = `<html><head><title>x</title></head><body><header>Logo Suche Konto</header>${MENU}<main><h1>Zahlungsarten</h1><p>${'Wir akzeptieren TWINT, PayPal, Visa, Mastercard und Kauf auf Rechnung. '.repeat(4)}</p></main><footer>Impressum AGB</footer></body></html>`;
  const text = cleanHtml(html);
  assert.match(text, /^Zahlungsarten Wir akzeptieren TWINT/);
  assert.doesNotMatch(text, /Kategorie 12|Impressum|Logo Suche/);
});

test('without <main>, the menu is still removed', () => {
  const text = cleanHtml(`<body>${MENU}<div><p>Rückgabe innerhalb von 30 Tagen kostenlos.</p></div></body>`);
  assert.equal(text, 'Rückgabe innerhalb von 30 Tagen kostenlos.');
});

test('excerpt finds the answer deep in a long page', () => {
  const filler = 'Allgemeine Informationen zu unserem Unternehmen und unserer Geschichte. '.repeat(120);
  const text = `${filler} Die Garantie beträgt 24 Monate. Garantiefälle melden Sie über das Kundenkonto. ${filler}`;
  const ex = excerpt(text, { task: 'How long is the warranty?', keywords: ['garantie'] }, 1500);
  assert.ok(ex.length <= 1600);
  assert.match(ex, /Garantie beträgt 24 Monate/);
});

const page = { url: 'https://s.test/garantie', title: 'Garantie', text: 'Die Garantie beträgt 24 Monate ab Kaufdatum.' };
const llm = (verdict) => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(verdict) } }] }) });

test('a pass backed by a real quote stays a pass', async () => {
  const r = await judge({ task: 'How long is the warranty?' }, [page], { apiKey: 'x', fetchImpl: llm({ fulfilled: true, confidence: 0.9, evidence_quote: 'Die Garantie beträgt 24 Monate', reason: 'ok' }) });
  assert.equal(r.fulfilled, true);
  assert.equal(r.quote_verified, true);
  assert.equal(r.excerpts[0].url, page.url);
});

test('a pass whose quote is not on the page becomes a failure', async () => {
  const r = await judge({ task: 'How long is the warranty?' }, [page], { apiKey: 'x', fetchImpl: llm({ fulfilled: true, confidence: 0.9, evidence_quote: 'Warranty is 36 months', reason: 'ok' }) });
  assert.equal(r.fulfilled, false);
  assert.match(r.reason, /not in the page text/);
});

test('entities are decoded so umlauts match and quotes verify', async () => {
  const { cleanHtml, decodeEntities } = await import('../src/html.js');
  assert.equal(decodeEntities('Geb&uuml;hren &euro; 3,90 &#228; &#xE4; &unknown;'), 'Gebühren € 3,90 ä ä &unknown;');
  assert.equal(cleanHtml('<body><!-- tracking --><p>Wir &uuml;bernehmen zwei Jahre Garantie</p></body>'), 'Wir übernehmen zwei Jahre Garantie');
});
