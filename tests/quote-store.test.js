import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeQuoteStore } from '../server/lib/quote-store.js';
import { normalizeQuoteItems } from '../src/lib/quote-format.js';
import { quotePdfFilename } from '../src/lib/pdf-export.js';

test('quotes persist, auto-number, recompute total, and support follow-up', () => {
  const database = new Database(':memory:');
  try {
    const store = initializeQuoteStore(database);
    const first = store.create({
      client_name: 'Camille Roy',
      client_email: 'camille@example.invalid',
      client_phone: '0612345678',
      service: 'Mariage',
      items: [
        { description: 'Reportage photo', quantity: 1, unit_price: 129000 },
        { description: 'Heure supplémentaire', quantity: 2, unit_price: 5000 }
      ],
      notes: 'Devis pour le 12 juin',
      valid_until: '2099-06-30'
    });

    const created = store.get(first);
    assert.equal(created.client_name, 'Camille Roy');
    assert.equal(created.status, 'draft');
    // 129000 + 2 x 5000 = 139000 centimes.
    assert.equal(created.total, 139000);
    // Numéro auto-généré pour l'année en cours, séquence 1.
    const year = new Date().getFullYear();
    assert.equal(created.number, `DEV-${year}-0001`);
    assert.equal(created.items.length, 2);

    // Un deuxième devis incrémente la séquence.
    const second = store.create({ client_name: 'Marc', client_email: 'marc@example.invalid', items: [{ description: 'Portrait', quantity: 1, unit_price: 15000 }] });
    assert.equal(store.get(second).number, `DEV-${year}-0002`);

    // La modification recalcule le total depuis les lignes.
    const updated = store.update(first, { items: [{ description: 'Forfait', quantity: 3, unit_price: 10000 }] });
    assert.equal(updated.total, 30000);
    assert.equal(updated.client_name, 'Camille Roy'); // champs inchangés conservés

    // Le statut suit le cycle commercial.
    store.updateStatus(first, 'sent');
    assert.equal(store.get(first).status, 'sent');
    store.markSent(first);
    assert.ok(store.get(first).sent_at);

    // Filtre par statut.
    assert.deepEqual(store.list({ status: 'sent' }).map((q) => q.id), [first]);
    assert.deepEqual(store.list({ status: 'accepted' }).map((q) => q.id), []);

    assert.equal(store.delete(second), true);
    assert.equal(store.delete(second), false);
  } finally {
    database.close();
  }
});

test('quote stats count by status and sum accepted revenue', () => {
  const database = new Database(':memory:');
  try {
    const store = initializeQuoteStore(database);
    const draft = store.create({ client_name: 'A', client_email: 'a@example.invalid', items: [{ description: 'x', quantity: 1, unit_price: 10000 }] });
    const accepted = store.create({ client_name: 'B', client_email: 'b@example.invalid', items: [{ description: 'y', quantity: 1, unit_price: 25000 }] });
    const refused = store.create({ client_name: 'C', client_email: 'c@example.invalid', items: [{ description: 'z', quantity: 1, unit_price: 99999 }] });

    store.updateStatus(accepted, 'accepted');
    store.updateStatus(refused, 'refused');

    const stats = store.stats();
    assert.equal(stats.total, 3);
    assert.equal(stats.draft, 1);
    assert.equal(stats.accepted, 1);
    assert.equal(stats.refused, 1);
    // Seuls les devis acceptés alimentent le chiffre d'affaires.
    assert.equal(stats.acceptedRevenue, 25000);
    assert.equal(draft > 0 && accepted > 0 && refused > 0, true);
  } finally {
    database.close();
  }
});

test('quote line normalization supports legacy field names and rejects broken rows before PDF export', () => {
  assert.deepEqual(normalizeQuoteItems([
    { label: 'Séance photo', qty: 2, price_cents: 12500 }
  ]), [
    { description: 'Séance photo', quantity: 2, unit_price: 12500 }
  ]);
  assert.deepEqual(normalizeQuoteItems(JSON.stringify([
    { title: 'Portrait', quantity: 1, unit_price: 9900 }
  ])), [
    { description: 'Portrait', quantity: 1, unit_price: 9900 }
  ]);
  assert.throws(
    () => normalizeQuoteItems([{ quantity: 1, unit_price: 9900 }]),
    /ligne 1.*incomplète ou invalide/i
  );
  assert.throws(() => normalizeQuoteItems('{broken'), /illisibles/i);
});

test('quote PDF filenames include a safe client name, issue date, and quote number', () => {
  assert.equal(
    quotePdfFilename({ client_name: 'Léa Martin / Studio', number: 'DEV-2026-0001' }, '2026-10-12T10:00:00.000Z'),
    'devis-lea-martin-studio-2026-10-12-dev-2026-0001.pdf'
  );
});
