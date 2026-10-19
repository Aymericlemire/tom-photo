import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeAppointmentStore } from '../server/lib/appointment-store.js';

test('appointments persist, list by range, and support follow-up', () => {
  const database = new Database(':memory:');
  try {
    const store = initializeAppointmentStore(database);
    const first = store.create({
      client_name: 'Léa Martin',
      client_email: 'lea@example.invalid',
      client_phone: '0612345678',
      service: 'Portrait',
      date: '2099-05-10',
      time: '10:00',
      duration: 90,
      price: 15000,
      notes: 'Séance en extérieur'
    });
    const second = store.create({
      client_name: 'Marc Dubois',
      client_email: 'marc@example.invalid',
      service: 'Mariage',
      date: '2099-05-12',
      time: '14:00'
    });

    const created = store.get(first);
    assert.equal(created.client_name, 'Léa Martin');
    assert.equal(created.status, 'pending');
    assert.equal(created.duration, 90);
    assert.equal(created.price, 15000);

    // Default values apply when omitted.
    assert.equal(store.get(second).duration, 60);
    assert.equal(store.get(second).price, 0);

    // Listing across a range returns both, ordered by date.
    const range = store.list({ from: '2099-05-01', to: '2099-05-31' });
    assert.equal(range.length, 2);
    assert.equal(range[0].id, first);
    assert.equal(range[1].id, second);

    // A single day only returns that day's appointment.
    assert.deepEqual(store.listByDate('2099-05-10').map((a) => a.id), [first]);

    // Partial update merges into the existing appointment.
    const updated = store.update(first, { status: 'confirmed', price: 18000 });
    assert.equal(updated.status, 'confirmed');
    assert.equal(updated.price, 18000);
    assert.equal(updated.client_name, 'Léa Martin'); // unchanged fields preserved

    assert.equal(store.delete(second), true);
    assert.equal(store.delete(second), false);
  } finally {
    database.close();
  }
});

test('occupied slots ignore cancelled appointments so the time is re-bookable', () => {
  const database = new Database(':memory:');
  try {
    const store = initializeAppointmentStore(database);
    const id = store.create({
      client_name: 'Client Occupé',
      client_email: 'occupe@example.invalid',
      service: 'Portrait',
      date: '2099-06-01',
      time: '10:00',
      duration: 60
    });

    assert.deepEqual(store.occupiedSlots('2099-06-01'), [{ time: '10:00', duration: 60 }]);

    // Cancelling frees the slot.
    assert.equal(store.updateStatus(id, 'cancelled'), true);
    assert.deepEqual(store.occupiedSlots('2099-06-01'), []);

    // A different day is unaffected.
    assert.deepEqual(store.occupiedSlots('2099-06-02'), []);
  } finally {
    database.close();
  }
});

test('stats count by status and sum revenue from confirmed and completed only', () => {
  const database = new Database(':memory:');
  try {
    const store = initializeAppointmentStore(database);
    const pending = store.create({ client_name: 'P', client_email: 'p@example.invalid', service: 'Portrait', date: '2099-07-01', time: '09:00', price: 10000 });
    const confirmed = store.create({ client_name: 'C', client_email: 'c@example.invalid', service: 'Mariage', date: '2099-07-02', time: '10:00', price: 25000 });
    const completed = store.create({ client_name: 'D', client_email: 'd@example.invalid', service: 'Drone', date: '2099-07-03', time: '11:00', price: 5000 });
    const cancelled = store.create({ client_name: 'X', client_email: 'x@example.invalid', service: 'Portrait', date: '2099-07-04', time: '12:00', price: 99999 });

    store.updateStatus(confirmed, 'confirmed');
    store.updateStatus(completed, 'completed');
    store.updateStatus(cancelled, 'cancelled');

    const stats = store.stats({ from: '2099-07-01', to: '2099-07-31' });
    assert.equal(stats.total, 4);
    assert.equal(stats.pending, 1);
    assert.equal(stats.confirmed, 1);
    assert.equal(stats.completed, 1);
    assert.equal(stats.cancelled, 1);
    // Revenue = confirmed (25000) + completed (5000). Pending and cancelled excluded.
    assert.equal(stats.revenue, 30000);

    // Date filtering respects the requested window.
    const early = store.stats({ from: '2099-07-01', to: '2099-07-02' });
    assert.equal(early.total, 2);
    assert.equal(early.revenue, 25000);
  } finally {
    database.close();
  }
});

test('payment tracking separates collected revenue from what is still outstanding', () => {
  const database = new Database(':memory:');
  try {
    const store = initializeAppointmentStore(database);
    const confirmed = store.create({ client_name: 'C', client_email: 'c@example.invalid', service: 'Mariage', date: '2099-08-01', time: '10:00', price: 25000 });
    const completed = store.create({ client_name: 'D', client_email: 'd@example.invalid', service: 'Drone', date: '2099-08-02', time: '11:00', price: 5000 });
    store.updateStatus(confirmed, 'confirmed');
    store.updateStatus(completed, 'completed');

    // Rien n'est encaissé au départ : tout le revenu reste "à encaisser".
    let stats = store.stats({ from: '2099-08-01', to: '2099-08-31' });
    assert.equal(stats.revenue, 30000);
    assert.equal(stats.collected, 0);
    assert.equal(stats.outstanding, 30000);

    // On encaisse le RDV confirmé.
    const paid = store.markPaid(confirmed, true);
    assert.equal(paid.paid, 1);
    assert.ok(paid.paid_at);

    stats = store.stats({ from: '2099-08-01', to: '2099-08-31' });
    assert.equal(stats.collected, 25000);
    assert.equal(stats.outstanding, 5000);

    // Annuler l'encaissement remet à zéro.
    store.markPaid(confirmed, false);
    stats = store.stats({ from: '2099-08-01', to: '2099-08-31' });
    assert.equal(stats.collected, 0);
    assert.equal(store.get(confirmed).paid_at, null);
  } finally {
    database.close();
  }
});

