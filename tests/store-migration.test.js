import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeContactRequestStore } from '../server/lib/contact-request-store.js';

test('legacy contact_requests tables gain the notification columns on init', () => {
  const database = new Database(':memory:');
  try {
    // Simulate a database created before the confirmation/reminder columns existed.
    database.exec(`
      CREATE TABLE contact_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'confirmed', 'closed')),
        email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'not_configured')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const requests = initializeContactRequestStore(database);
    const id = requests.create({
      name: 'Legacy Client',
      email: 'legacy@example.invalid',
      service: 'Mariage',
      date: '2099-01-01',
      time: '10:00',
      location: '',
      message: 'Legacy row created before the migration.'
    });
    assert.equal(requests.updateStatus(id, 'confirmed'), true);
    assert.equal(requests.listConfirmedForDate('2099-01-01').length, 1);
    assert.equal(requests.markConfirmationSent(id), true);
    assert.equal(requests.markReminderSent(id), true);
    assert.ok(requests.get(id).confirmation_sent_at);
    assert.ok(requests.get(id).reminder_sent_at);
  } finally {
    database.close();
  }
});
