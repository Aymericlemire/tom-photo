// contact-request-store.js
// -----------------------------------------------------------------------------
// Gère le stockage des DEMANDES DE CONTACT (formulaire du site) dans SQLite.
// En plus des colonnes d'origine, on suit maintenant 2 dates d'envoi d'e-mail :
//   - confirmation_sent_at : quand l'e-mail de confirmation a été envoyé
//   - reminder_sent_at     : quand l'e-mail de rappel (veille du RDV) a été envoyé
// Cela évite d'envoyer deux fois le même e-mail (idempotence).
// -----------------------------------------------------------------------------
export function initializeContactRequestStore(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS contact_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'confirmed', 'closed')),
      email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'not_configured')),
      confirmation_sent_at TEXT,
      reminder_sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS contact_requests_created_at ON contact_requests (created_at DESC);
  `);

  // Migration : si la table existe déjà (ancienne version), on ajoute les
  // colonnes manquantes pour la confirmation et le rappel.
  const columns = new Set(database.prepare('PRAGMA table_info(contact_requests)').all().map((column) => column.name));
  const ensureColumn = (name, ddl) => {
    if (!columns.has(name)) database.exec(`ALTER TABLE contact_requests ADD COLUMN ${ddl}`);
  };
  ensureColumn('confirmation_sent_at', 'confirmation_sent_at TEXT');
  ensureColumn('reminder_sent_at', 'reminder_sent_at TEXT');

  const insert = database.prepare(`
    INSERT INTO contact_requests (data, created_at, updated_at)
    VALUES (?, ?, ?)
  `);
  const updateEmailStatus = database.prepare(`
    UPDATE contact_requests SET email_status = ?, updated_at = ? WHERE id = ?
  `);
  const updateStatus = database.prepare(`
    UPDATE contact_requests SET status = ?, updated_at = ? WHERE id = ?
  `);
  const markConfirmation = database.prepare(`
    UPDATE contact_requests SET confirmation_sent_at = ?, updated_at = ? WHERE id = ?
  `);
  const markReminder = database.prepare(`
    UPDATE contact_requests SET reminder_sent_at = ?, updated_at = ? WHERE id = ?
  `);
  const remove = database.prepare('DELETE FROM contact_requests WHERE id = ?');
  const selectColumns = 'id, data, status, email_status, confirmation_sent_at, reminder_sent_at, created_at, updated_at';

  return {
    create(data) {
      const now = new Date().toISOString();
      return Number(insert.run(JSON.stringify(data), now, now).lastInsertRowid);
    },
    get(id) {
      const row = database.prepare(`SELECT ${selectColumns} FROM contact_requests WHERE id = ?`).get(id);
      return row ? { ...row, data: JSON.parse(row.data) } : null;
    },
    list({ limit, offset }) {
      return database.prepare(`
        SELECT ${selectColumns}
        FROM contact_requests
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset).map((row) => ({ ...row, data: JSON.parse(row.data) }));
    },
    count() {
      return database.prepare('SELECT COUNT(*) AS total FROM contact_requests').get().total;
    },
    updateStatus(id, status) {
      return updateStatus.run(status, new Date().toISOString(), id).changes > 0;
    },
    updateEmailStatus(id, status) {
      return updateEmailStatus.run(status, new Date().toISOString(), id).changes > 0;
    },
    markConfirmationSent(id) {
      return markConfirmation.run(new Date().toISOString(), new Date().toISOString(), id).changes > 0;
    },
    markReminderSent(id) {
      return markReminder.run(new Date().toISOString(), new Date().toISOString(), id).changes > 0;
    },
    // Renvoie les demandes CONFIRMÉES, dont le rappel n'a pas encore été envoyé,
    // et dont la date souhaitée correspond exactement à la date donnée.
    // Sert à la tâche quotidienne de rappel (veille du rendez-vous).
    listConfirmedForDate(date) {
      return database.prepare(`
        SELECT ${selectColumns}
        FROM contact_requests
        WHERE status = 'confirmed'
          AND reminder_sent_at IS NULL
          AND json_extract(data, '$.date') = ?
      `).all(date).map((row) => ({ ...row, data: JSON.parse(row.data) }));
    },
    delete(id) {
      return remove.run(id).changes > 0;
    }
  };
}

