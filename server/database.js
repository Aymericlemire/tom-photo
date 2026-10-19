import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { initializeContactRequestStore } from './lib/contact-request-store.js';
import { initializeAppointmentStore } from './lib/appointment-store.js';
import { initializeQuoteStore } from './lib/quote-store.js';
import { initializeAccountingStore } from './lib/accounting-store.js';
import { initializeCrmStore } from './lib/crm-store.js';
import { migrateGalleryCategories } from './lib/gallery-migration.js';

const here = dirname(fileURLToPath(import.meta.url));
export const dataDirectory = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(here, 'data');
mkdirSync(dataDirectory, { recursive: true });

export const db = new Database(resolve(dataDirectory, 'tom-photo.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS site_content (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);
const contactRequestStore = initializeContactRequestStore(db);
const appointmentStore = initializeAppointmentStore(db);
const quoteStore = initializeQuoteStore(db);
const accountingStore = initializeAccountingStore(db);
const crmStore = initializeCrmStore(db);

const defaults = JSON.parse(readFileSync(resolve(here, 'default-content.json'), 'utf8'));
const existing = db.prepare('SELECT json FROM site_content WHERE id = 1').get();
if (!existing) {
  db.prepare('INSERT INTO site_content (id, json, updated_at) VALUES (1, ?, ?)')
    .run(JSON.stringify(defaults), new Date().toISOString());
} else {
  const content = JSON.parse(existing.json);
  const mergeDefaults = (current, fallback) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return current ?? fallback;
    return Object.fromEntries(Object.entries(fallback).map(([key, value]) => [
      key,
      Object.hasOwn(current, key) ? mergeDefaults(current[key], value) : structuredClone(value)
    ]));
  };
  const migratedContent = mergeDefaults(content, defaults);
  for (const page of ['expertise', 'pricing', 'about']) {
    if (content[page]?.canvas && migratedContent.pageCanvases) {
      migratedContent.pageCanvases[page] = content[page].canvas;
      delete migratedContent[page].canvas;
    }
  }
  if (migratedContent.gallery && defaults.gallery) {
    migratedContent.gallery = migrateGalleryCategories(content.gallery, migratedContent.gallery, defaults.gallery);
  }
  if (JSON.stringify(migratedContent) !== existing.json) {
    db.prepare('UPDATE site_content SET json = ?, updated_at = ? WHERE id = 1')
      .run(JSON.stringify(migratedContent), new Date().toISOString());
  }
}

export const getContent = () => JSON.parse(
  db.prepare('SELECT json FROM site_content WHERE id = 1').get().json
);

export const saveContent = (content) => {
  db.prepare('UPDATE site_content SET json = ?, updated_at = ? WHERE id = 1')
    .run(JSON.stringify(content), new Date().toISOString());
};

export const createContactRequest = (data) => contactRequestStore.create(data);
export const listContactRequests = (options) => contactRequestStore.list(options);
export const countContactRequests = () => contactRequestStore.count();
export const getContactRequest = (id) => contactRequestStore.get(id);
export const updateContactRequestStatus = (id, status) => contactRequestStore.updateStatus(id, status);
export const updateContactRequestEmailStatus = (id, status) => contactRequestStore.updateEmailStatus(id, status);
// Suivi des e-mails : on marque l'heure d'envoi de la confirmation / du rappel…
export const markContactRequestConfirmationSent = (id) => contactRequestStore.markConfirmationSent(id);
export const markContactRequestReminderSent = (id) => contactRequestStore.markReminderSent(id);
// …et on récupère les RDV confirmés d'une date donnée pour la tâche de rappel.
export const listConfirmedContactRequestsForDate = (date) => contactRequestStore.listConfirmedForDate(date);
export const deleteContactRequest = (id) => contactRequestStore.delete(id);

// --- Rendez-vous (module Planning) -------------------------------------------
// Le store expose déjà tout (create/get/list/update/delete/stats…). On le
// ré-exporte tel quel pour que les routes de index.js l'utilisent facilement.
export const appointments = appointmentStore;

// --- Devis (module commercial) -----------------------------------------------
// Même principe : on ré-exporte le store devis pour les routes de index.js.
export const quotes = quoteStore;

// --- Registre comptable de gestion -----------------------------------------
export const accountingEntries = accountingStore;
export const crm = crmStore;
