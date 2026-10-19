// quote-store.js
// -----------------------------------------------------------------------------
// Gère le stockage des DEVIS (côté studio) dans SQLite.
//
// Un devis est une proposition commerciale envoyée à un client :
//   - un numéro unique (ex. DEV-2026-0001)
//   - un client (nom, e-mail, téléphone) + une prestation
//   - une ou plusieurs LIGNES (description, quantité, prix unitaire en centimes)
//   - un montant total (centimes), une date de validité, des notes
//   - un statut de suivi : brouillon / envoyé / accepté / refusé / expiré / annulé
//   - le suivi d'envoi d'e-mail (sent_at)
//
// C'est la base du module commercial, complémentaire au planning (rendez-vous)
// et à la comptabilité (chiffre d'affaires).
// -----------------------------------------------------------------------------
export function initializeQuoteStore(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,        -- numéro lisible, ex. DEV-2026-0001
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      client_phone TEXT NOT NULL DEFAULT '',
      service TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'accepted', 'refused', 'expired', 'cancelled')),
      items TEXT NOT NULL DEFAULT '[]',  -- JSON : [{ description, quantity, unit_price }]
      total INTEGER NOT NULL DEFAULT 0,  -- montant total en centimes
      notes TEXT NOT NULL DEFAULT '',
      valid_until TEXT,                  -- date AAAA-MM-JJ de validité (facultatif)
      sent_at TEXT,                      -- quand l'e-mail de devis a été envoyé
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS quotes_created_at ON quotes (created_at DESC);
    CREATE INDEX IF NOT EXISTS quotes_status ON quotes (status);
  `);

  // Migration douce : ajoute les colonnes manquantes sur une ancienne table.
  const columns = new Set(database.prepare('PRAGMA table_info(quotes)').all().map((c) => c.name));
  const ensureColumn = (name, ddl) => {
    if (!columns.has(name)) database.exec(`ALTER TABLE quotes ADD COLUMN ${ddl}`);
  };
  ensureColumn('sent_at', 'sent_at TEXT');
  ensureColumn('valid_until', 'valid_until TEXT');

  const selectColumns =
    'id, number, client_name, client_email, client_phone, service, status, items, total, notes, valid_until, sent_at, created_at, updated_at';

  const parseRow = (row) => (row ? { ...row, items: JSON.parse(row.items) } : null);

  const insert = database.prepare(`
    INSERT INTO quotes
      (number, client_name, client_email, client_phone, service, status, items, total, notes, valid_until, sent_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Calcule le prochain numéro de devis pour l'année en cours : DEV-AAAA-0001.
  function nextNumber(now = new Date()) {
    const year = now.getFullYear();
    const prefix = `DEV-${year}-`;
    const row = database.prepare('SELECT number FROM quotes WHERE number LIKE ? ORDER BY number DESC LIMIT 1').get(`${prefix}%`);
    const match = row?.number ? /-(\d+)$/.exec(row.number) : null;
    const sequence = (match ? Number(match[1]) : 0) + 1;
    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }

  // Recalcule le total (centimes) à partir des lignes : quantité x prix unitaire.
  const computeTotal = (items) => (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0
  );

  return {
    // items : tableau d'objets { description, quantity, unit_price } (centimes).
    // Le total est toujours recalculé depuis les lignes pour rester fiable.
    create(data) {
      const now = new Date().toISOString();
      const items = Array.isArray(data.items) ? data.items : [];
      const result = insert.run(
        data.number || nextNumber(),
        data.client_name,
        data.client_email,
        data.client_phone ?? '',
        data.service ?? '',
        data.status ?? 'draft',
        JSON.stringify(items),
        computeTotal(items),
        data.notes ?? '',
        data.valid_until || null,
        data.sent_at || null,
        now,
        now
      );
      return Number(result.lastInsertRowid);
    },
    get(id) {
      return parseRow(database.prepare(`SELECT ${selectColumns} FROM quotes WHERE id = ?`).get(id));
    },
    // Filtre optionnel par statut ; renvoie les plus récents d'abord.
    list({ status } = {}) {
      if (status) {
        return database.prepare(`SELECT ${selectColumns} FROM quotes WHERE status = ? ORDER BY created_at DESC, id DESC`).all(status);
      }
      return database.prepare(`SELECT ${selectColumns} FROM quotes ORDER BY created_at DESC, id DESC`).all();
    },
    // Fusionne un patch partiel avec le devis existant puis recalcule le total.
    update(id, patch) {
      const current = this.get(id);
      if (!current) return null;
      const next = { ...current, ...patch, updated_at: new Date().toISOString() };
      const items = Array.isArray(next.items) ? next.items : current.items;
      database.prepare(`
        UPDATE quotes SET
          client_name = ?, client_email = ?, client_phone = ?, service = ?, status = ?,
          items = ?, total = ?, notes = ?, valid_until = ?, sent_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        next.client_name, next.client_email, next.client_phone, next.service, next.status,
        JSON.stringify(items), computeTotal(items), next.notes, next.valid_until || null, next.sent_at || null,
        next.updated_at, id
      );
      return this.get(id);
    },
    updateStatus(id, status) {
      const result = database.prepare('UPDATE quotes SET status = ?, updated_at = ? WHERE id = ?')
        .run(status, new Date().toISOString(), id);
      return result.changes > 0 ? this.get(id) : null;
    },
    // Marque l'e-mail de devis comme envoyé (idempotence + affichage admin).
    markSent(id) {
      database.prepare('UPDATE quotes SET sent_at = ?, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), new Date().toISOString(), id);
      return this.get(id);
    },
    delete(id) {
      return database.prepare('DELETE FROM quotes WHERE id = ?').run(id).changes > 0;
    },
    // Statistiques pour le tableau de bord / la comptabilité.
    // Le chiffre d'affaires "accepté" n'additionne que les devis ACCEPTÉS.
    stats({ from, to } = {}) {
      const params = [];
      let where = '';
      if (from) { where += (where ? ' AND ' : 'WHERE ') + 'created_at >= ?'; params.push(from); }
      if (to) { where += (where ? ' AND ' : 'WHERE ') + 'created_at < ?'; params.push(to); }
      const byStatus = database.prepare(`SELECT status, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total FROM quotes ${where} GROUP BY status`).all(...params);
      const counts = { draft: 0, sent: 0, accepted: 0, refused: 0, expired: 0, cancelled: 0 };
      const amounts = { draft: 0, sent: 0, accepted: 0, refused: 0, expired: 0, cancelled: 0 };
      byStatus.forEach((row) => {
        counts[row.status] = row.count;
        amounts[row.status] = row.total;
      });
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      return { total, ...counts, amounts, acceptedRevenue: amounts.accepted };
    }
  };
}
