import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initializeAppointmentStore } from '../server/lib/appointment-store.js';
import { initializeContactRequestStore } from '../server/lib/contact-request-store.js';
import { initializeCrmStore } from '../server/lib/crm-store.js';
import { initializeQuoteStore } from '../server/lib/quote-store.js';

test('CRM groups requests, quotes and appointments by email and phone and keeps follow-ups', () => {
  const database = new Database(':memory:');
  try {
    const inquiries = initializeContactRequestStore(database);
    const appointments = initializeAppointmentStore(database);
    const quotes = initializeQuoteStore(database);
    const crm = initializeCrmStore(database);

    inquiries.create({
      name: 'Camille Martin',
      email: ' CAMILLE@example.invalid ',
      phone: '+33 6 12 34 56 78',
      service: 'Mariage',
      message: 'Photographie pour notre mariage'
    });
    quotes.create({
      client_name: 'Camille Martin',
      client_email: 'camille@example.invalid',
      client_phone: '06 12 34 56 78',
      service: 'Mariage',
      status: 'sent',
      items: [{ description: 'Reportage photo', quantity: 1, unit_price: 95000 }]
    });
    appointments.create({
      client_name: 'Camille Martin',
      client_email: '',
      client_phone: '06.12.34.56.78',
      service: 'Mariage',
      date: '2099-06-12',
      time: '10:00',
      status: 'confirmed',
      price: 95000
    });

    let result = crm.list();
    assert.equal(result.items.length, 1);
    assert.equal(result.stats.total, 1);
    assert.equal(result.items[0].stage, 'booked');
    assert.deepEqual(new Set(result.items[0].history.map((event) => event.kind)), new Set(['inquiry', 'quote', 'appointment']));
    assert.equal(result.items[0].history.length, 3);

    const contactId = result.items[0].id;
    crm.update(contactId, { stage: 'quote_sent', notes: 'Préférences : cérémonie en extérieur.' });
    crm.createActivity(contactId, {
      kind: 'task',
      title: 'Appeler pour confirmer le devis',
      details: 'Vérifier les horaires avec le client.',
      due_date: new Date().toISOString().slice(0, 10)
    });

    result = crm.list({ query: 'camille', stage: 'quote_sent' });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].notes, 'Préférences : cérémonie en extérieur.');
    assert.equal(result.items[0].activities.length, 1);
    assert.equal(result.stats.tasksDue, 1);

    const taskId = result.items[0].activities[0].id;
    crm.updateActivity(contactId, taskId, true);
    assert.equal(crm.list().stats.tasksDue, 0);
    assert.equal(crm.deleteActivity(contactId, taskId), true);
    assert.equal(crm.list().items[0].activities.length, 0);

    const duplicate = crm.create({
      name: 'Camille Martin',
      email: 'camille@example.invalid',
      phone: '',
      company: '',
      stage: 'lead',
      notes: ''
    });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.contact.id, contactId);
    assert.equal(crm.list().items.length, 1);
  } finally {
    database.close();
  }
});

test('CRM does not merge two different email addresses just because they share a phone', () => {
  const database = new Database(':memory:');
  try {
    const inquiries = initializeContactRequestStore(database);
    initializeAppointmentStore(database);
    initializeQuoteStore(database);
    const crm = initializeCrmStore(database);

    inquiries.create({
      name: 'Client A',
      email: 'a@example.invalid',
      phone: '0612345678',
      service: 'Portrait',
      message: 'Premier contact'
    });
    inquiries.create({
      name: 'Client B',
      email: 'b@example.invalid',
      phone: '0612345678',
      service: 'Portrait',
      message: 'Deuxième contact'
    });

    const result = crm.list();
    assert.equal(result.items.length, 2);
    assert.equal(result.items.reduce((total, contact) => total + contact.history.length, 0), 2);
  } finally {
    database.close();
  }
});
