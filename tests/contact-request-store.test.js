import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeContactRequestStore } from '../server/lib/contact-request-store.js';

test('contact requests persist and support admin follow-up and deletion', () => {
  const database = new Database(':memory:');
  try {
    const requests = initializeContactRequestStore(database);
    const submitted = {
      name: 'Test Admin',
      email: 'test@example.invalid',
      phone: '',
      service: 'Portrait',
      date: '2099-05-12',
      time: '13:30',
      location: '',
      message: 'Synthetic request for the local storage test.'
    };

    const id = requests.create(submitted);
    assert.equal(requests.count(), 1);
    assert.deepEqual(requests.list({ limit: 10, offset: 0 })[0].data, submitted);
    assert.equal(requests.list({ limit: 10, offset: 0 })[0].status, 'new');
    assert.equal(requests.updateStatus(id, 'confirmed'), true);
    assert.equal(requests.updateEmailStatus(id, 'sent'), true);
    assert.equal(requests.list({ limit: 10, offset: 0 })[0].status, 'confirmed');
    assert.equal(requests.list({ limit: 10, offset: 0 })[0].email_status, 'sent');
    assert.equal(requests.delete(id), true);
    assert.equal(requests.delete(id), false);
    assert.equal(requests.count(), 0);
  } finally {
    database.close();
  }
});

test('contact requests track confirmation and reminder notifications', () => {
  const database = new Database(':memory:');
  try {
    const requests = initializeContactRequestStore(database);
    const submitted = {
      name: 'Nora Test',
      email: 'nora@example.invalid',
      phone: '',
      service: 'Mariage',
      date: '2099-07-01',
      time: '14:00',
      location: '',
      message: 'Confirmation et rappel automatiques.'
    };

    const id = requests.create(submitted);
    assert.equal(requests.get(id).id, id);
    assert.equal(requests.get(id).confirmation_sent_at, null);
    assert.equal(requests.get(id).reminder_sent_at, null);

    // Only confirmed, not-yet-reminded bookings for the exact date are returned.
    assert.deepEqual(requests.listConfirmedForDate('2099-07-01'), []);
    assert.equal(requests.updateStatus(id, 'confirmed'), true);
    const due = requests.listConfirmedForDate('2099-07-01');
    assert.equal(due.length, 1);
    assert.equal(due[0].id, id);

    assert.equal(requests.markConfirmationSent(id), true);
    assert.ok(requests.get(id).confirmation_sent_at);

    assert.equal(requests.markReminderSent(id), true);
    assert.ok(requests.get(id).reminder_sent_at);
    // After the reminder is marked, the booking is no longer due.
    assert.deepEqual(requests.listConfirmedForDate('2099-07-01'), []);
  } finally {
    database.close();
  }
});

