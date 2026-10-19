// Registre de gestion : chaque opération est conservée séparément des rendez-vous
// et des devis, avec un montant en centimes pour éviter les erreurs d'arrondi.
export function initializeAccountingStore(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS accounting_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      counterparty TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL CHECK (amount >= 0),
      vat_rate REAL NOT NULL DEFAULT 0,
      entry_date TEXT NOT NULL,
      payment_date TEXT,
      receipt_url TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS accounting_entries_date ON accounting_entries (entry_date DESC);
    CREATE INDEX IF NOT EXISTS accounting_entries_type ON accounting_entries (type);
  `);

  const columns = new Set(database.prepare('PRAGMA table_info(accounting_entries)').all().map((column) => column.name));
  if (!columns.has('counterparty')) database.exec("ALTER TABLE accounting_entries ADD COLUMN counterparty TEXT NOT NULL DEFAULT ''");
  if (!columns.has('payment_date')) database.exec('ALTER TABLE accounting_entries ADD COLUMN payment_date TEXT');
  if (!columns.has('receipt_url')) database.exec("ALTER TABLE accounting_entries ADD COLUMN receipt_url TEXT NOT NULL DEFAULT ''");

  const fields = 'id, type, description, category, counterparty, amount, vat_rate, entry_date, payment_date, receipt_url, notes, created_at, updated_at';

  const applyDateFilter = ({ from, to, type } = {}) => {
    const clauses = [];
    const parameters = [];
    if (from) { clauses.push('entry_date >= ?'); parameters.push(from); }
    if (to) { clauses.push('entry_date <= ?'); parameters.push(to); }
    if (type) { clauses.push('type = ?'); parameters.push(type); }
    return {
      where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      parameters
    };
  };

  const netAndVat = (amount, rate) => {
    const net = rate > 0 ? Math.round(amount * 100 / (100 + rate)) : amount;
    return { net, vat: amount - net };
  };

  const entryValues = (data) => [
    data.type,
    data.description,
    data.category,
    data.counterparty ?? '',
    data.amount,
    data.vat_rate ?? 0,
    data.entry_date,
    data.payment_date || null,
    data.receipt_url ?? '',
    data.notes ?? ''
  ];

  return {
    create(data) {
      const now = new Date().toISOString();
      const result = database.prepare(`
        INSERT INTO accounting_entries
          (type, description, category, counterparty, amount, vat_rate, entry_date, payment_date, receipt_url, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...entryValues(data), now, now);
      return Number(result.lastInsertRowid);
    },
    get(id) {
      return database.prepare(`SELECT ${fields} FROM accounting_entries WHERE id = ?`).get(id) ?? null;
    },
    list({ from, to, type } = {}) {
      const filter = applyDateFilter({ from, to, type });
      return database.prepare(`
        SELECT ${fields} FROM accounting_entries
        ${filter.where}
        ORDER BY entry_date DESC, id DESC
      `).all(...filter.parameters);
    },
    update(id, data) {
      const current = this.get(id);
      if (!current) return null;
      database.prepare(`
        UPDATE accounting_entries SET
          type = ?, description = ?, category = ?, counterparty = ?, amount = ?, vat_rate = ?,
          entry_date = ?, payment_date = ?, receipt_url = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(...entryValues(data), new Date().toISOString(), id);
      return this.get(id);
    },
    delete(id) {
      return database.prepare('DELETE FROM accounting_entries WHERE id = ?').run(id).changes > 0;
    },
    summary({ from, to } = {}) {
      const filter = applyDateFilter({ from, to });
      const rows = database.prepare(`
        SELECT type, amount, vat_rate FROM accounting_entries
        ${filter.where}
      `).all(...filter.parameters);
      const summary = {
        income: { total: 0, net: 0, vat: 0, count: 0 },
        expense: { total: 0, net: 0, vat: 0, count: 0 }
      };
      for (const row of rows) {
        const totals = summary[row.type];
        const calculated = netAndVat(row.amount, row.vat_rate);
        totals.total += row.amount;
        totals.net += calculated.net;
        totals.vat += calculated.vat;
        totals.count += 1;
      }
      return {
        ...summary,
        balance: summary.income.total - summary.expense.total,
        vatBalance: summary.income.vat - summary.expense.vat
      };
    }
  };
}
