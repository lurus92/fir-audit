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
