import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailIsConfigured,
  sendConfirmationEmail,
  sendContactEmail,
  sendReminderEmail
} from '../server/lib/email.js';

const configuredEnv = {
  SMTP_HOST: 'smtp.example.invalid',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'user',
  SMTP_PASSWORD: 'pass',
  SMTP_FROM: 'Tom Photo <no-reply@example.invalid>',
  CONTACT_TO: 'tomphoto79000@gmail.com'
};

test('email helpers require full SMTP configuration', () => {
  assert.equal(emailIsConfigured(configuredEnv), true);
  assert.equal(emailIsConfigured({}), false);
  assert.equal(emailIsConfigured({ ...configuredEnv, SMTP_FROM: '' }), false);
});

const inquiry = {
  name: 'Camille',
  email: 'camille@example.invalid',
  phone: '0600000000',
  service: 'Mariage',
  date: '2099-07-01',
  time: '14:00',
  location: 'Niort',
  message: 'Je souhaite un devis.'
};

test('email helpers refuse to send when SMTP is not configured', async () => {
  await assert.rejects(() => sendContactEmail(inquiry, {}), (error) => error.status === 503);
  await assert.rejects(() => sendConfirmationEmail(inquiry, {}), (error) => error.status === 503);
  await assert.rejects(() => sendReminderEmail(inquiry, {}), (error) => error.status === 503);
});
