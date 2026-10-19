import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeAccountingStore } from '../server/lib/accounting-store.js';

const entry = (overrides = {}) => ({
  type: 'income',
  description: 'Séance portrait',
  category: 'Prestation photo',
  amount: 12000,
  vat_rate: 20,
  entry_date: '2099-04-12',
  ...overrides
});

test('accounting entries persist, update, filter, summarize and delete', () => {
  const database = new Database(':memory:');
  try {
    const store = initializeAccountingStore(database);
    const incomeId = store.create(entry({ payment_date: '2099-04-13', receipt_url: '/api/admin/accounting/receipts/0123456789abcdef0123456789abcdef.pdf' }));
    const expenseId = store.create(entry({
      type: 'expense',
      description: 'Objectif photo',
      category: 'Matériel',
      amount: 6000,
      vat_rate: 20,
      entry_date: '2099-05-02'
    }));
    store.create(entry({ entry_date: '2098-12-31', amount: 5000 }));

    assert.equal(store.get(incomeId).payment_date, '2099-04-13');
    assert.equal(store.get(incomeId).receipt_url.endsWith('.pdf'), true);
    assert.deepEqual(store.list({ from: '2099-01-01', to: '2099-12-31' }).map(({ id }) => id), [expenseId, incomeId]);
    assert.deepEqual(store.list({ from: '2099-01-01', to: '2099-12-31', type: 'income' }).map(({ id }) => id), [incomeId]);

    const summary = store.summary({ from: '2099-01-01', to: '2099-12-31' });
    assert.equal(summary.income.total, 12000);
    assert.equal(summary.income.net, 10000);
    assert.equal(summary.income.vat, 2000);
    assert.equal(summary.expense.total, 6000);
    assert.equal(summary.expense.vat, 1000);
    assert.equal(summary.balance, 6000);
    assert.equal(summary.vatBalance, 1000);

    const updated = store.update(incomeId, entry({ amount: 15000, category: 'Mariage' }));
    assert.equal(updated.amount, 15000);
    assert.equal(updated.category, 'Mariage');
    assert.equal(store.delete(expenseId), true);
    assert.equal(store.delete(expenseId), false);
  } finally {
    database.close();
  }
});

test('accounting schema is upgraded safely when optional columns were not present', () => {
  const database = new Database(':memory:');
  try {
    database.exec(`
      CREATE TABLE accounting_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        amount INTEGER NOT NULL,
        vat_rate REAL NOT NULL DEFAULT 0,
        entry_date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const store = initializeAccountingStore(database);
    const id = store.create(entry({ vat_rate: 0 }));
    assert.equal(store.get(id).counterparty, '');
    assert.equal(store.get(id).payment_date, null);
    assert.equal(store.get(id).receipt_url, '');
  } finally {
    database.close();
  }
});
