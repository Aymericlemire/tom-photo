import assert from 'node:assert/strict';
import test from 'node:test';
import {
  euroToCents,
  formatEuros,
  formItemToQuoteItem,
  quoteItemTotal,
  quoteTotalCents,
  toPdfSafeText
} from '../src/lib/quote-format.js';

test('les montants pour les PDF n\'utilisent que des espaces simples', () => {
  const text = formatEuros(25555513);
  assert.equal(text, '255 555,13 €');
  assert.doesNotMatch(text, /[\u202f\u00a0]/);
  assert.equal(formatEuros(0), '0,00 €');
  assert.equal(toPdfSafeText('1\u202f000\u00a0€'), '1 000 €');
});

test('convertit les euros saisis en centimes sans erreur de virgule flottante', () => {
  assert.equal(euroToCents('19.99'), 1999);
  assert.equal(euroToCents('19,99'), 1999);
  assert.equal(euroToCents('1450.10'), 145010);
  assert.equal(euroToCents(''), 0);
  assert.equal(euroToCents('-5'), 0);
});

test('les lignes de l\'éditeur utilisent les mêmes règles à l\'affichage et à l\'enregistrement', () => {
  assert.deepEqual(formItemToQuoteItem({ description: ' Mariage ', quantity: '', unit_price: '150' }), {
    description: 'Mariage', quantity: 1, unit_price: 15000
  });
  assert.equal(formItemToQuoteItem({ description: 'x', quantity: 1.6, unit_price: 10 }).quantity, 2);
  assert.equal(formItemToQuoteItem({ description: 'x', quantity: 0, unit_price: 10 }).quantity, 1);
});

test('le total est la somme des lignes en centimes', () => {
  const items = [
    formItemToQuoteItem({ description: 'Portrait', quantity: 2, unit_price: '150.50' }),
    formItemToQuoteItem({ description: 'Retouches', quantity: 3, unit_price: '19.99' })
  ];
  assert.equal(quoteItemTotal(items[0]), 30100);
  assert.equal(quoteTotalCents(items), 30100 + 5997);
});
