// appointment-store.js
// -----------------------------------------------------------------------------
// Gère le stockage des RENDEZ-VOUS (le "planning" du studio) dans SQLite.
//
// Un RDV est différent d'une simple "demande de contact" :
//   - il a une date ET une heure précises + une durée
//   - il a un statut de suivi : en attente / confirmé / annulé / terminé
//   - il porte un prix (base de la future compta : chiffre d'affaires)
//
// Cette table est la FONDATION des modules à venir (devis, compta, stats).
// -----------------------------------------------------------------------------
export function initializeAppointmentStore(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      client_phone TEXT NOT NULL DEFAULT '',
      service TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,                    -- format YYYY-MM-DD
      time TEXT NOT NULL,                    -- format HH:MM
      duration INTEGER NOT NULL DEFAULT 60,  -- duree en minutes
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
      price INTEGER NOT NULL DEFAULT 0,      -- montant en centimes (compta)
      paid INTEGER NOT NULL DEFAULT 0,       -- 0 = non encaissé, 1 = encaissé (compta)
      paid_at TEXT,                          -- date d'encaissement (compta)
      notes TEXT NOT NULL DEFAULT '',
      confirmation_sent_at TEXT,
      reminder_sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS appointments_date ON appointments (date);
    CREATE INDEX IF NOT EXISTS appointments_status ON appointments (status);
  `);

  // Migration douce : si une ancienne table existe sans certaines colonnes,
  // on les ajoute (meme approche que contact-request-store.js).
  const columns = new Set(database.prepare('PRAGMA table_info(appointments)').all().map((c) => c.name));
  const ensureColumn = (name, ddl) => {
    if (!columns.has(name)) database.exec(`ALTER TABLE appointments ADD COLUMN ${ddl}`);
  };
  ensureColumn('duration', 'duration INTEGER NOT NULL DEFAULT 60');
  ensureColumn('price', 'price INTEGER NOT NULL DEFAULT 0');
  ensureColumn('paid', 'paid INTEGER NOT NULL DEFAULT 0');
  ensureColumn('paid_at', 'paid_at TEXT');
  ensureColumn('notes', "notes TEXT NOT NULL DEFAULT ''");
  ensureColumn('confirmation_sent_at', 'confirmation_sent_at TEXT');
  ensureColumn('reminder_sent_at', 'reminder_sent_at TEXT');

  const selectColumns =
    'id, client_name, client_email, client_phone, service, date, time, duration, status, price, paid, paid_at, notes, confirmation_sent_at, reminder_sent_at, created_at, updated_at';

  const insert = database.prepare(`
    INSERT INTO appointments
      (client_name, client_email, client_phone, service, date, time, duration, status, price, paid, paid_at, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    create(data) {
      const now = new Date().toISOString();
      const paid = data.paid ? 1 : 0;
      const result = insert.run(
        data.client_name,
        data.client_email,
        data.client_phone ?? '',
        data.service ?? '',
        data.date,
        data.time,
        Number.isInteger(data.duration) ? data.duration : 60,
        data.status ?? 'pending',
        Number.isInteger(data.price) ? data.price : 0,
        paid,
        paid ? now : null,
        data.notes ?? '',
        now,
        now
      );
      return Number(result.lastInsertRowid);
    },
    get(id) {
      return database.prepare(`SELECT ${selectColumns} FROM appointments WHERE id = ?`).get(id) ?? null;
    },
    // RDV entre deux dates (inclues), tries par date puis heure.
    list({ from, to } = {}) {
      if (from && to) {
        return database.prepare(`
          SELECT ${selectColumns} FROM appointments
          WHERE date >= ? AND date <= ?
          ORDER BY date ASC, time ASC
        `).all(from, to);
      }
      if (from) {
        return database.prepare(`
          SELECT ${selectColumns} FROM appointments
          WHERE date >= ?
          ORDER BY date ASC, time ASC
        `).all(from);
      }
      return database.prepare(`SELECT ${selectColumns} FROM appointments ORDER BY date ASC, time ASC`).all();
    },
    // RDV d'une journee precise (affichage jour du calendrier).
    listByDate(date) {
      return database.prepare(`
        SELECT ${selectColumns} FROM appointments
        WHERE date = ?
        ORDER BY time ASC
      `).all(date);
    },
    // Horaires deja pris un jour donne. On exclut les RDV ANNULES : une
    // annulation libere le creneau et le rend de nouveau reservable.
    occupiedSlots(date) {
      return database.prepare(`
        SELECT time, duration FROM appointments
        WHERE date = ? AND status != 'cancelled'
        ORDER BY time ASC
      `).all(date);
    },
    hasConflict(date, time, excludeId = null) {
      const row = database.prepare(`
        SELECT id FROM appointments
        WHERE date = ? AND time = ? AND status != 'cancelled' AND id != ?
        LIMIT 1
      `).get(date, time, excludeId || 0);
      return Boolean(row);
    },
    listConfirmedForDate(date) {
      return database.prepare(`
        SELECT ${selectColumns} FROM appointments
        WHERE date = ? AND status = 'confirmed' AND reminder_sent_at IS NULL
        ORDER BY time ASC
      `).all(date);
    },
    markConfirmationSent(id) {
      const now = new Date().toISOString();
      return database.prepare('UPDATE appointments SET confirmation_sent_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, id).changes > 0;
    },
    markReminderSent(id) {
      const now = new Date().toISOString();
      return database.prepare('UPDATE appointments SET reminder_sent_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, id).changes > 0;
    },
    // Fusionne un correctif partiel (patch) avec le RDV existant.
    update(id, patch) {
      const current = this.get(id);
      if (!current) return null;
      const next = { ...current, ...patch, updated_at: new Date().toISOString() };
      // paid_at suit l'état d'encaissement (true/false passé dans le patch).
      if (Object.hasOwn(patch, 'paid')) {
        const paid = patch.paid ? 1 : 0;
        next.paid = paid;
        next.paid_at = paid ? (current.paid_at || next.updated_at) : null;
      }
      database.prepare(`
        UPDATE appointments SET
          client_name = ?, client_email = ?, client_phone = ?, service = ?,
          date = ?, time = ?, duration = ?, status = ?, price = ?, paid = ?, paid_at = ?, notes = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        next.client_name, next.client_email, next.client_phone, next.service,
        next.date, next.time, next.duration, next.status, next.price, next.paid ? 1 : 0, next.paid_at || null, next.notes,
        next.updated_at, id
      );
      return this.get(id);
    },
    updateStatus(id, status) {
      const result = database.prepare('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?')
        .run(status, new Date().toISOString(), id);
      return result.changes > 0;
    },
    // Marque un RDV comme encaissé / non encaissé (suivi comptable simple).
    markPaid(id, paid) {
      const now = new Date().toISOString();
      const result = database.prepare('UPDATE appointments SET paid = ?, paid_at = ?, updated_at = ? WHERE id = ?')
        .run(paid ? 1 : 0, paid ? now : null, now, id);
      return result.changes > 0 ? this.get(id) : null;
    },
    delete(id) {
      return database.prepare('DELETE FROM appointments WHERE id = ?').run(id).changes > 0;
    },
    // Statistiques pour le tableau de bord / la compta.
    // Le chiffre d'affaires (revenue) n'additionne que les RDV confirmes ou termines.
    // On sépare aussi ce qui est ENCAISSÉ (paid) de ce qui reste dû.
    stats({ from, to } = {}) {
      const params = [];
      let where = '';
      if (from) { where += (where ? ' AND ' : 'WHERE ') + 'date >= ?'; params.push(from); }
      if (to) { where += (where ? ' AND ' : 'WHERE ') + 'date <= ?'; params.push(to); }

      const byStatus = database.prepare(`
        SELECT status, COUNT(*) AS count FROM appointments ${where} GROUP BY status
      `).all(...params);
      const counts = { pending: 0, confirmed: 0, cancelled: 0, completed: 0 };
      byStatus.forEach((row) => { counts[row.status] = row.count; });

      const revenueRow = database.prepare(`
        SELECT COALESCE(SUM(price), 0) AS total
        FROM appointments
        ${where ? `${where} AND ` : 'WHERE '} status IN ('confirmed', 'completed')
      `).get(...params);

      // Encaissé = RDV confirmés/terminés ET payés. Reste à encaisser = le complément.
      const collectedRow = database.prepare(`
        SELECT COALESCE(SUM(price), 0) AS total
        FROM appointments
        ${where ? `${where} AND ` : 'WHERE '} status IN ('confirmed', 'completed') AND paid = 1
      `).get(...params);

      const collected = collectedRow.total;
      const revenue = revenueRow.total;
      const total = counts.pending + counts.confirmed + counts.cancelled + counts.completed;
      return {
        total,
        ...counts,
        revenue,
        collected,
        outstanding: Math.max(0, revenue - collected)
      };
    }
  };
}
