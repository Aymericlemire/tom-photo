import { randomUUID } from 'node:crypto';

const STAGES = new Set(['lead', 'contacted', 'qualified', 'quote_sent', 'booked', 'customer', 'lost']);

const normalizeEmail = (value) => String(value || '').trim().toLocaleLowerCase('en-US');
const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('33') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
};

function collectSourceRecords(database) {
  const inquiries = database.prepare(`
    SELECT id, data, status, created_at, updated_at
    FROM contact_requests
    ORDER BY created_at DESC, id DESC
  `).all().map((row) => {
    const data = JSON.parse(row.data);
    return {
      source: 'inquiry',
      sourceId: row.id,
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      title: `Demande reçue${data.service ? ` · ${data.service}` : ''}`,
      details: data.message || '',
      status: row.status,
      happenedAt: row.created_at,
      amount: null
    };
  });

  const appointments = database.prepare(`
    SELECT id, client_name, client_email, client_phone, service, date, time,
      status, price, paid, notes, created_at, updated_at
    FROM appointments
    ORDER BY date DESC, time DESC, id DESC
  `).all().map((row) => ({
    source: 'appointment',
    sourceId: row.id,
    name: row.client_name,
    email: row.client_email,
    phone: row.client_phone,
    title: `Rendez-vous${row.service ? ` · ${row.service}` : ''}`,
    details: [
      `${row.date} à ${row.time}`,
      `Statut : ${row.status}`,
      row.paid ? 'Réglé' : 'Non réglé',
      row.notes
    ].filter(Boolean).join(' · '),
    status: row.status,
    happenedAt: `${row.date}T${row.time}:00`,
    amount: row.price
  }));

  const quotes = database.prepare(`
    SELECT id, number, client_name, client_email, client_phone, service,
      status, total, valid_until, sent_at, created_at, updated_at
    FROM quotes
    ORDER BY created_at DESC, id DESC
  `).all().map((row) => ({
    source: 'quote',
    sourceId: row.id,
    name: row.client_name,
    email: row.client_email,
    phone: row.client_phone,
    title: `Devis ${row.number}${row.service ? ` · ${row.service}` : ''}`,
    details: [
      `Statut : ${row.status}`,
      row.valid_until ? `Valable jusqu’au ${row.valid_until}` : '',
      row.sent_at ? 'Envoyé au client' : ''
    ].filter(Boolean).join(' · '),
    status: row.status,
    happenedAt: row.sent_at || row.created_at,
    amount: row.total
  }));

  return [...inquiries, ...quotes, ...appointments];
}

function inferredStage(records) {
  if (records.some((record) => record.source === 'appointment' && record.status === 'completed')) return 'customer';
  if (records.some((record) => record.source === 'quote' && record.status === 'accepted')) return 'customer';
  if (records.some((record) => record.source === 'appointment' && record.status === 'confirmed')) return 'booked';
  if (records.some((record) => record.source === 'quote' && record.status === 'sent')) return 'quote_sent';
  if (records.some((record) => record.source === 'quote' && record.status === 'draft')) return 'qualified';
  if (records.some((record) => record.source === 'inquiry' && record.status === 'contacted')) return 'contacted';
  return 'lead';
}

export function initializeCrmStore(database) {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL DEFAULT 'lead'
        CHECK (stage IN ('lead', 'contacted', 'qualified', 'quote_sent', 'booked', 'customer', 'lost')),
      stage_manual INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS crm_contact_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('email', 'phone')),
      value TEXT NOT NULL,
      UNIQUE (kind, value)
    );
    CREATE INDEX IF NOT EXISTS crm_contact_aliases_contact_id ON crm_contact_aliases(contact_id);
    CREATE TABLE IF NOT EXISTS crm_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('note', 'task')),
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS crm_activities_contact_id ON crm_activities(contact_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS crm_activities_due_date ON crm_activities(due_date, completed_at);
  `);
  const contactColumns = new Set(database.prepare('PRAGMA table_info(crm_contacts)').all().map((column) => column.name));
  if (!contactColumns.has('stage_manual')) {
    database.exec('ALTER TABLE crm_contacts ADD COLUMN stage_manual INTEGER NOT NULL DEFAULT 0');
  }

  const findByAlias = database.prepare(`
    SELECT contacts.*
    FROM crm_contacts AS contacts
    JOIN crm_contact_aliases AS aliases ON aliases.contact_id = contacts.id
    WHERE aliases.kind = ? AND aliases.value = ?
    LIMIT 1
  `);
  const findByKey = database.prepare('SELECT * FROM crm_contacts WHERE match_key = ?');
  const addAlias = database.prepare(`
    INSERT OR IGNORE INTO crm_contact_aliases (contact_id, kind, value)
    VALUES (?, ?, ?)
  `);
  const insertContact = database.prepare(`
    INSERT INTO crm_contacts (match_key, name, email, phone, stage, stage_manual, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const readContact = database.prepare('SELECT * FROM crm_contacts WHERE id = ?');

  function matchContact(email, phone) {
    if (email) {
      const byEmail = findByAlias.get('email', email);
      if (byEmail) return byEmail;
    }
    if (phone) {
      const byPhone = findByAlias.get('phone', phone);
      if (byPhone && (!email || !normalizeEmail(byPhone.email) || normalizeEmail(byPhone.email) === email)) {
        return byPhone;
      }
    }
    return null;
  }

  function addAvailableAliases(contactId, email, phone) {
    if (email) addAlias.run(contactId, 'email', email);
    if (phone) {
      const existingPhoneOwner = findByAlias.get('phone', phone);
      if (!existingPhoneOwner || existingPhoneOwner.id === contactId) addAlias.run(contactId, 'phone', phone);
    }
  }

  function syncSources() {
    const records = collectSourceRecords(database);
    const eventsByContact = new Map();
    const sourceRecordsByContact = new Map();

    const ordered = [...records].sort((left, right) => {
      const leftHasEmail = Boolean(normalizeEmail(left.email));
      const rightHasEmail = Boolean(normalizeEmail(right.email));
      return Number(rightHasEmail) - Number(leftHasEmail);
    });

    for (const record of ordered) {
      const email = normalizeEmail(record.email);
      const phone = normalizePhone(record.phone);
      const displayPhone = String(record.phone || '').trim();
      const matchKey = email
        ? `email:${email}`
        : phone
          ? `phone:${phone}`
          : `source:${record.source}:${record.sourceId}`;
      let contact = matchContact(email, phone) || findByKey.get(matchKey);

      if (!contact) {
        const now = new Date().toISOString();
        const id = Number(insertContact.run(
          matchKey,
          record.name || 'Nouveau contact',
          email,
          displayPhone,
          inferredStage([record]),
          0,
          now,
          now
        ).lastInsertRowid);
        contact = readContact.get(id);
      } else {
        const nextEmail = contact.email || email;
        const nextPhone = contact.phone || displayPhone;
        if (nextEmail !== contact.email || nextPhone !== contact.phone) {
          database.prepare(`
            UPDATE crm_contacts SET email = ?, phone = ?, updated_at = ? WHERE id = ?
          `).run(nextEmail, nextPhone, new Date().toISOString(), contact.id);
          contact = readContact.get(contact.id);
        }
      }

      addAvailableAliases(contact.id, email, phone);
      if (!eventsByContact.has(contact.id)) eventsByContact.set(contact.id, []);
      if (!sourceRecordsByContact.has(contact.id)) sourceRecordsByContact.set(contact.id, []);
      sourceRecordsByContact.get(contact.id).push(record);
      eventsByContact.get(contact.id).push({
        id: `${record.source}-${record.sourceId}`,
        kind: record.source,
        title: record.title,
        details: record.details,
        status: record.status,
        happened_at: record.happenedAt,
        amount: record.amount
      });
    }

    for (const [contactId, sourceRecords] of sourceRecordsByContact) {
      const contact = readContact.get(contactId);
      const nextStage = inferredStage(sourceRecords);
      if (!contact.stage_manual && contact.stage !== nextStage) {
        database.prepare('UPDATE crm_contacts SET stage = ?, updated_at = ? WHERE id = ?')
          .run(nextStage, new Date().toISOString(), contactId);
      }
    }

    return eventsByContact;
  }

  return {
    list({ query = '', stage = '' } = {}) {
      const eventsByContact = syncSources();
      const search = `%${String(query).trim().replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
      const filters = [];
      const params = [];
      if (query.trim()) {
        filters.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\')");
        params.push(search, search, search, search);
      }
      if (stage && STAGES.has(stage)) {
        filters.push('stage = ?');
        params.push(stage);
      }
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const contacts = database.prepare(`
        SELECT * FROM crm_contacts ${where}
        ORDER BY updated_at DESC, name COLLATE NOCASE ASC
      `).all(...params);
      const activities = database.prepare(`
        SELECT * FROM crm_activities
        ORDER BY CASE WHEN completed_at IS NULL AND due_date IS NOT NULL THEN 0 ELSE 1 END,
          due_date ASC, created_at DESC
      `).all();
      const activitiesByContact = new Map();
      for (const activity of activities) {
        if (!activitiesByContact.has(activity.contact_id)) activitiesByContact.set(activity.contact_id, []);
        activitiesByContact.get(activity.contact_id).push(activity);
      }
      const today = new Date().toISOString().slice(0, 10);
      const allContacts = database.prepare('SELECT stage FROM crm_contacts').all();
      const stageCounts = Object.fromEntries([...STAGES].map((key) => [key, 0]));
      allContacts.forEach((contact) => { stageCounts[contact.stage] = (stageCounts[contact.stage] || 0) + 1; });
      const tasksDue = database.prepare(`
        SELECT COUNT(*) AS total FROM crm_activities
        WHERE kind = 'task' AND completed_at IS NULL AND due_date IS NOT NULL AND due_date <= ?
      `).get(today).total;

      return {
        items: contacts.map((contact) => {
          const history = eventsByContact.get(contact.id) || [];
          const contactActivities = activitiesByContact.get(contact.id) || [];
          const nextTask = contactActivities.find((activity) => (
            activity.kind === 'task' && !activity.completed_at && activity.due_date
          ));
          return {
            ...contact,
            history: history.sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at))),
            activities: contactActivities,
            next_follow_up: nextTask?.due_date || null
          };
        }),
        stats: {
          total: allContacts.length,
          active: allContacts.filter((contact) => contact.stage !== 'lost' && contact.stage !== 'customer').length,
          tasksDue,
          stages: stageCounts
        }
      };
    },

    get(id) {
      this.list();
      return readContact.get(id) || null;
    },

    create(data) {
      syncSources();
      const email = normalizeEmail(data.email);
      const phone = normalizePhone(data.phone);
      const existing = matchContact(email, phone);
      if (existing) {
        return { contact: existing, created: false };
      }
      const now = new Date().toISOString();
      const matchKey = email || phone
        ? email ? `email:${email}` : `phone:${phone}`
        : `manual:${randomUUID()}`;
      const id = Number(insertContact.run(
        matchKey,
        data.name,
        String(data.email || '').trim(),
        String(data.phone || '').trim(),
        data.stage || 'lead',
        1,
        now,
        now
      ).lastInsertRowid);
      addAvailableAliases(id, email, phone);
      if (data.company || data.notes) {
        database.prepare('UPDATE crm_contacts SET company = ?, notes = ? WHERE id = ?')
          .run(data.company || '', data.notes || '', id);
      }
      return { contact: readContact.get(id), created: true };
    },

    update(id, patch) {
      const current = readContact.get(id);
      if (!current) return null;
      const email = Object.hasOwn(patch, 'email') ? normalizeEmail(patch.email) : current.email;
      const phoneIdentity = Object.hasOwn(patch, 'phone') ? normalizePhone(patch.phone) : normalizePhone(current.phone);
      const phone = Object.hasOwn(patch, 'phone') ? String(patch.phone || '').trim() : current.phone;
      const duplicate = matchContact(email, phoneIdentity);
      if (duplicate && duplicate.id !== id) {
        const error = new Error('Une autre fiche utilise déjà cette adresse e-mail ou ce téléphone.');
        error.code = 'CRM_DUPLICATE_IDENTITY';
        throw error;
      }
      const next = { ...current, ...patch, email, phone, updated_at: new Date().toISOString() };
      database.prepare(`
        UPDATE crm_contacts
        SET name = ?, email = ?, phone = ?, company = ?, stage = ?, stage_manual = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        next.name, next.email, next.phone, next.company, next.stage,
        Object.hasOwn(patch, 'stage') ? 1 : current.stage_manual,
        next.notes, next.updated_at, id
      );
      addAvailableAliases(id, email, phoneIdentity);
      return readContact.get(id);
    },

    createActivity(contactId, data) {
      if (!readContact.get(contactId)) return null;
      const now = new Date().toISOString();
      const result = database.prepare(`
        INSERT INTO crm_activities (contact_id, kind, title, details, due_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(contactId, data.kind, data.title, data.details || '', data.due_date || null, now, now);
      return database.prepare('SELECT * FROM crm_activities WHERE id = ?').get(Number(result.lastInsertRowid));
    },

    updateActivity(contactId, activityId, completed) {
      const now = new Date().toISOString();
      const result = database.prepare(`
        UPDATE crm_activities SET completed_at = ?, updated_at = ?
        WHERE id = ? AND contact_id = ? AND kind = 'task'
      `).run(completed ? now : null, now, activityId, contactId);
      if (!result.changes) return null;
      return database.prepare('SELECT * FROM crm_activities WHERE id = ?').get(activityId);
    },

    deleteActivity(contactId, activityId) {
      return database.prepare(`
        DELETE FROM crm_activities WHERE id = ? AND contact_id = ?
      `).run(activityId, contactId).changes > 0;
    }
  };
}
