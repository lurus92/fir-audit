import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyQuote } from '../src/judge.js';
import { isServicePage } from '../src/crawl.js';

const page = 'Ein Umtausch ist innerhalb von 30 Tagen möglich. Weitere Bedingungen folgen hier. Rücksendungen sind kostenlos ab CHF 50 Bestellwert.';

test('quotes stitched with "..." verify when every fragment is real', () => {
  assert.equal(verifyQuote('Ein Umtausch ist innerhalb von 30 Tagen möglich ... Rücksendungen sind kostenlos', page), true);
  assert.equal(verifyQuote('Ein Umtausch ist innerhalb von 30 Tagen möglich … Rücksendungen sind immer gratis weltweit und ohne Kosten für alle', page), false);
});

test('an invented quote still fails', () => {
  assert.equal(verifyQuote('Für alle Produkte gibt es eine 2-jährige Garantie.', page), false);
  assert.equal(verifyQuote('', page), false);
});

test('service pages: segment-start match, jobs and product slugs excluded', () => {
  assert.equal(isServicePage({ url: 'https://b.de/sol-slim-rescue-howler-erste-hilfe-set/' }), false);
  assert.equal(isServicePage({ url: 'https://b.de/jobs/teamlead_customer_service_aftersales' }), false);
  assert.equal(isServicePage({ url: 'https://b.de/versandkosten' }), true);
  assert.equal(isServicePage({ url: 'https://b.de/hilfe/rueckgabe' }), true);
  assert.equal(isServicePage({ url: 'https://b.de/x/y', title: 'Versand & Lieferung' }), true);
});

test('a condensed list quote verifies when every item is on the page', () => {
  const t = 'Zahlungsarten: Kreditkarte. Wir akzeptieren Visa sowie Mastercard. Ebenso PayPal und Kauf auf Rechnung über Klarna.';
  assert.equal(verifyQuote('Kreditkarte (Visa und Mastercard), PayPal, Kauf auf Rechnung.', t), true);
  assert.equal(verifyQuote('Kreditkarte (Visa und Mastercard), TWINT, Kauf auf Rechnung.', t), false);
});

test('locale variants count as one page', async () => {
  const { rankPages, localeKey } = await import('../src/retrieve.js');
  assert.equal(localeKey('https://www.b.com/de-CH/info/Retouren-1/'), localeKey('https://www.b.com/de-DE/info/Retouren-1/'));
  const pages = ['de-CH', 'de-DE', 'fr-CH'].map((l) => ({ url: `https://b.com/${l}/info/retouren`, title: 'Retouren', text: 'Retouren Rückgabe 30 Tage' }))
    .concat([{ url: 'https://b.com/de-CH/info/versand', title: 'Versand', text: 'Versand Rückgabe Kosten' }]);
  const top = rankPages({ task: 'Rückgabe', keywords: ['retouren'] }, pages);
  assert.equal(top.length, 2);
});
