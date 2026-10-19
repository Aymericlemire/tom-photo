// index.js — LE SERVEUR (back-end) du site Tom Photo
// -----------------------------------------------------------------------------
// Sert à la fois :
//   - l'API du site    (récupérer/modifier le contenu, formulaire de contact)
//   - l'espace admin   (connexion, demandes reçues, envoi d'e-mails)
// Points clés ajoutés pour les e-mails automatiques :
//   • Confirmation automatique au client quand une demande passe en "Confirmée"
//     (voir la route PATCH /api/admin/inquiries/:id plus bas)
//   • Envoi manuel possible (POST .../notify) : confirmation OU rappel
//   • Tâche quotidienne de rappel la veille du RDV (voir runDailyReminders
//     et le planificateur tout en bas du fichier)
// -----------------------------------------------------------------------------
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config as loadEnv } from 'dotenv';
// En développement, on force le .env à écraser les variables d'environnement
// héritées du terminal (ex. un PORT résiduel). Ainsi l'API tourne toujours sur
// le port attendu par le proxy Vite (5174). En production on garde le
// comportement standard (l'environnement réel prime).
loadEnv({ override: process.env.NODE_ENV !== 'production' });
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import {
  countContactRequests,
  createContactRequest,
  accountingEntries,
  db,
  appointments,
  crm,
  quotes,
  deleteContactRequest,
  getContent,
  getContactRequest,
  listContactRequests,
  listConfirmedContactRequestsForDate,
  markContactRequestConfirmationSent,
  markContactRequestReminderSent,
  saveContent,
  updateContactRequestEmailStatus,
  updateContactRequestStatus
} from './database.js';
import {
  emailIsConfigured,
  sendConfirmationEmail,
  sendContactEmail,
  sendQuoteEmail,
  sendReminderEmail
} from './lib/email.js';
import { isAllowedOrigin } from './lib/origin.js';
import { SqliteSessionStore } from './lib/sqlite-session-store.js';
import {
  appointmentInputSchema,
  appointmentPaidSchema,
  accountingEntrySchema,
  contactRequestStatusSchema,
  contactSchema,
  contentSchema,
  crmActivityCompletionSchema,
  crmActivitySchema,
  crmContactSchema,
  crmContactUpdateSchema,
  crmStageSchema,
  loginSchema,
  quoteInputSchema,
  quoteStatusUpdateSchema
} from './lib/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const uploadDirectory = resolve(here, 'uploads');
const accountingReceiptDirectory = resolve(here, 'private-accounting-receipts');
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 5174);

await mkdir(uploadDirectory, { recursive: true });
await mkdir(accountingReceiptDirectory, { recursive: true });

if (production && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET must contain at least 32 characters in production.');
}
if (production && (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH)) {
  throw new Error('Create an admin account with "npm run setup:admin" before production startup.');
}

const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is temporary in development; use setup:admin to create persistent local settings.');
}
if (!emailIsConfigured()) {
  console.warn('SMTP is not configured. Contact submissions will show an explicit setup error until it is.');
}

const app = express();
app.disable('x-powered-by');
if (production) app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '256kb', strict: true }));
app.use(session({
  name: 'tom-photo.sid',
  secret: sessionSecret,
  store: new SqliteSessionStore(db),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: production,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const configuredOrigin = process.env.APP_ORIGIN
  ? new URL(process.env.APP_ORIGIN).origin
  : 'http://127.0.0.1:5175';
const allowedOrigins = new Set([configuredOrigin]);
if (!production) {
  for (const host of ['localhost', '127.0.0.1']) {
    allowedOrigins.add(`http://${host}:5173`);
    allowedOrigins.add(`http://${host}:5175`);
  }
}

app.use('/api', (request, response, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    next();
    return;
  }
  const origin = request.get('origin');
  const requestOrigin = `${request.protocol}://${request.get('host')}`;
  if (!isAllowedOrigin(origin, requestOrigin, allowedOrigins)) {
    response.status(403).json({ error: 'Origine de requête non autorisée.' });
    return;
  }
  if (request.get('sec-fetch-site') === 'cross-site') {
    response.status(403).json({ error: 'Requête intersite refusée.' });
    return;
  }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' }
});
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes envoyées. Réessayez dans quelques minutes.' }
});

const hasSameValue = (left, right) => {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
};

const requireAdmin = (request, response, next) => {
  if (!request.session.admin) {
    response.status(401).json({ error: 'Connectez-vous pour accéder à cette fonction.' });
    return;
  }
  next();
};

const toDateInputValue = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('-');

// -----------------------------------------------------------------------------
// runDailyReminders : envoie le rappel "votre RDV est demain" à chaque demande
// CONFIRMÉE dont la date souhaitée = demain. Idempotent : une fois le rappel
// envoyé, il est marqué en base (reminder_sent_at) et ne repartira pas.
// Ne fait rien si le SMTP n'est pas configuré.
// -----------------------------------------------------------------------------
async function runDailyReminders(env = process.env) {
  if (!emailIsConfigured(env)) return { sent: 0, skipped: 0 };
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1); // demain
  const target = toDateInputValue(tomorrow); // format YYYY-MM-DD
  const due = listConfirmedContactRequestsForDate(target); // RDV confirmés de demain
  let sent = 0;
  let skipped = 0;
  for (const inquiry of due) {
    if (!inquiry.data?.email) {
      skipped += 1; // pas d'e-mail exploitable → on ignore
      continue;
    }
    try {
      await sendReminderEmail(inquiry.data, env);
      markContactRequestReminderSent(inquiry.id); // marque comme envoyé
      sent += 1;
    } catch (error) {
      console.error('Daily reminder delivery failed:', error.message);
      skipped += 1;
    }
  }
  return { sent, skipped, date: target };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 }
});
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }
});

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/content', (_request, response) => {
  const content = contentSchema.parse(getContent());
  response.set('Cache-Control', 'no-store');
  response.json(content);
});

app.post('/api/contact', contactLimiter, async (request, response) => {
  const parsed = contactSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Vérifiez les champs du formulaire.',
      fields: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
    });
    return;
  }
  if (parsed.data.date && getContent().contact.unavailableDates.includes(parsed.data.date)) {
    response.status(400).json({ error: 'Cette date n’est plus disponible. Choisissez une autre date ou laissez le champ vide.' });
    return;
  }
  const inquiryId = createContactRequest(parsed.data);
  if (!emailIsConfigured()) {
    updateContactRequestEmailStatus(inquiryId, 'not_configured');
    response.status(202).json({
      message: 'Votre demande est enregistrée dans l’espace administrateur. La notification par e-mail n’est pas configurée pour le moment.'
    });
    return;
  }
  try {
    await sendContactEmail(parsed.data);
    updateContactRequestEmailStatus(inquiryId, 'sent');
    response.status(202).json({ message: 'Votre demande a bien été envoyée. Tom vous répondra dès que possible.' });
  } catch (error) {
    console.error('Contact email delivery failed:', error.message);
    updateContactRequestEmailStatus(inquiryId, 'failed');
    response.status(202).json({
      message: 'Votre demande est enregistrée dans l’espace administrateur, mais la notification par e-mail n’a pas pu être envoyée.'
    });
  }
});

app.get('/api/admin/session', (request, response) => {
  response.json({ authenticated: Boolean(request.session.admin) });
});

app.post('/api/admin/login', loginLimiter, async (request, response, next) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Identifiant ou mot de passe invalide.' });
    return;
  }
  const { username, password } = parsed.data;
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) {
    response.status(503).json({ error: 'Aucun compte administrateur n’est configuré. Exécutez « npm run setup:admin ».' });
    return;
  }

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  } catch {
    next(new Error('ADMIN_PASSWORD_HASH must be a valid bcrypt hash.'));
    return;
  }
  const usernameMatches = hasSameValue(username, process.env.ADMIN_USERNAME);
  if (!usernameMatches || !passwordMatches) {
    response.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    return;
  }

  request.session.regenerate((error) => {
    if (error) {
      next(error);
      return;
    }
    request.session.admin = { username, authenticatedAt: Date.now() };
    request.session.save((saveError) => {
      if (saveError) {
        next(saveError);
        return;
      }
      response.json({ authenticated: true });
    });
  });
});

app.post('/api/admin/logout', requireAdmin, (request, response, next) => {
  request.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    response.clearCookie('tom-photo.sid', {
      httpOnly: true,
      sameSite: 'strict',
      secure: production
    });
    response.status(204).end();
  });
});

app.get('/api/admin/content', requireAdmin, (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json(getContent());
});

app.get('/api/admin/inquiries', requireAdmin, (request, response) => {
  const page = Number(request.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1) {
    response.status(400).json({ error: 'La page demandée est invalide.' });
    return;
  }
  const limit = 30;
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) {
    response.status(400).json({ error: 'La page demandée est invalide.' });
    return;
  }
  const total = countContactRequests();
  response.set('Cache-Control', 'no-store');
  response.json({
    items: listContactRequests({ limit, offset }),
    total,
    page,
    pageCount: Math.ceil(total / limit)
  });
});

app.patch('/api/admin/inquiries/:id', requireAdmin, async (request, response) => {
  const id = Number(request.params.id);
  const parsed = contactRequestStatusSchema.safeParse(request.body?.status);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    response.status(400).json({ error: 'La demande ou son statut est invalide.' });
    return;
  }
  const inquiry = getContactRequest(id);
  if (!inquiry) {
    response.status(404).json({ error: 'Cette demande n’existe plus.' });
    return;
  }
  if (!updateContactRequestStatus(id, parsed.data)) {
    response.status(404).json({ error: 'Cette demande n’existe plus.' });
    return;
  }
  let message = 'Le suivi de la demande a été mis à jour.';

  // Si on vient de CONFIRMER le rendez-vous et qu'on a l'e-mail du client,
  // on envoie automatiquement l'e-mail de confirmation (une seule fois).
  if (parsed.data === 'confirmed' && inquiry.data?.email) {
    if (!inquiry.confirmation_sent_at) {
      if (!emailIsConfigured()) {
        message += ' La confirmation par e-mail n’est pas configurée pour le moment.';
      } else {
        try {
          await sendConfirmationEmail(inquiry.data);
          markContactRequestConfirmationSent(id);
          message += ' Un e-mail de confirmation a été envoyé au client.';
        } catch (error) {
          console.error('Confirmation email delivery failed:', error.message);
          message += ' L’e-mail de confirmation n’a pas pu être envoyé.';
        }
      }
    } else {
      message += ' Un e-mail de confirmation avait déjà été envoyé.';
    }
  }

  response.json({ message });
});

app.delete('/api/admin/inquiries/:id', requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'La demande sélectionnée est invalide.' });
    return;
  }
  if (!deleteContactRequest(id)) {
    response.status(404).json({ error: 'Cette demande n’existe plus.' });
    return;
  }
  response.status(204).end();
});

// =============================================================================
// CRM — fiches clients, historique commercial et relances
// =============================================================================
app.get('/api/admin/crm', requireAdmin, (request, response) => {
  const query = typeof request.query.q === 'string' ? request.query.q.trim() : '';
  const rawStage = typeof request.query.stage === 'string' ? request.query.stage.trim() : '';
  if (rawStage && !crmStageSchema.safeParse(rawStage).success) {
    response.status(400).json({ error: 'Le filtre de suivi CRM est invalide.' });
    return;
  }
  response.set('Cache-Control', 'no-store');
  response.json(crm.list({ query, stage: rawStage }));
});

app.post('/api/admin/crm', requireAdmin, (request, response) => {
  const parsed = crmContactSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Certaines informations du contact sont invalides.',
      fields: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
    });
    return;
  }
  const result = crm.create(parsed.data);
  response.set('Cache-Control', 'no-store');
  response.status(result.created ? 201 : 200).json(result);
});

app.patch('/api/admin/crm/:id', requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  const parsed = crmContactUpdateSchema.safeParse(request.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    response.status(400).json({ error: 'Le contact ou les informations à modifier sont invalides.' });
    return;
  }
  try {
    const contact = crm.update(id, parsed.data);
    if (!contact) {
      response.status(404).json({ error: 'Cette fiche client n’existe plus.' });
      return;
    }
    response.set('Cache-Control', 'no-store');
    response.json({ contact });
  } catch (error) {
    if (error.code === 'CRM_DUPLICATE_IDENTITY') {
      response.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
});

app.post('/api/admin/crm/:id/activities', requireAdmin, (request, response) => {
  const contactId = Number(request.params.id);
  const parsed = crmActivitySchema.safeParse(request.body);
  if (!Number.isSafeInteger(contactId) || contactId < 1 || !parsed.success) {
    response.status(400).json({ error: 'La relance ou la note est invalide.' });
    return;
  }
  const activity = crm.createActivity(contactId, parsed.data);
  if (!activity) {
    response.status(404).json({ error: 'Cette fiche client n’existe plus.' });
    return;
  }
  response.set('Cache-Control', 'no-store');
  response.status(201).json({ activity });
});

app.patch('/api/admin/crm/:id/activities/:activityId', requireAdmin, (request, response) => {
  const contactId = Number(request.params.id);
  const activityId = Number(request.params.activityId);
  const parsed = crmActivityCompletionSchema.safeParse(request.body);
  if (!Number.isSafeInteger(contactId) || contactId < 1 ||
      !Number.isSafeInteger(activityId) || activityId < 1 || !parsed.success) {
    response.status(400).json({ error: 'La relance ou son état est invalide.' });
    return;
  }
  const activity = crm.updateActivity(contactId, activityId, parsed.data.completed);
  if (!activity) {
    response.status(404).json({ error: 'Cette relance n’existe plus.' });
    return;
  }
  response.set('Cache-Control', 'no-store');
  response.json({ activity });
});

app.delete('/api/admin/crm/:id/activities/:activityId', requireAdmin, (request, response) => {
  const contactId = Number(request.params.id);
  const activityId = Number(request.params.activityId);
  if (!Number.isSafeInteger(contactId) || contactId < 1 ||
      !Number.isSafeInteger(activityId) || activityId < 1) {
    response.status(400).json({ error: 'La fiche ou la relance sélectionnée est invalide.' });
    return;
  }
  if (!crm.deleteActivity(contactId, activityId)) {
    response.status(404).json({ error: 'Cette relance n’existe plus.' });
    return;
  }
  response.status(204).end();
});

// -----------------------------------------------------------------------------
// POST /api/admin/inquiries/:id/notify
// Envoi MANUEL d'un e-mail au client depuis l'admin :
//   kind = "confirmation" → renvoie l'e-mail de confirmation
//   kind = "reminder"     → envoie l'e-mail de rappel
// -----------------------------------------------------------------------------
app.post('/api/admin/inquiries/:id/notify', requireAdmin, async (request, response) => {
  const id = Number(request.params.id);
  const kind = request.body?.kind;
  if (!Number.isSafeInteger(id) || id < 1 || !['confirmation', 'reminder'].includes(kind)) {
    response.status(400).json({ error: 'La demande ou le type de notification est invalide.' });
    return;
  }
  const inquiry = getContactRequest(id);
  if (!inquiry || !inquiry.data?.email) {
    response.status(404).json({ error: 'Cette demande n’a pas d’adresse e-mail exploitable.' });
    return;
  }
  if (!emailIsConfigured()) {
    response.status(503).json({ error: 'Le service e-mail n’est pas configuré.' });
    return;
  }
  try {
    if (kind === 'confirmation') {
      await sendConfirmationEmail(inquiry.data);
      markContactRequestConfirmationSent(id);
    } else {
      await sendReminderEmail(inquiry.data);
      markContactRequestReminderSent(id);
    }
    response.json({ message: kind === 'confirmation'
      ? 'L’e-mail de confirmation a été envoyé au client.'
      : 'L’e-mail de rappel a été envoyé au client.' });
  } catch (error) {
    console.error('Manual notification delivery failed:', error.message);
    response.status(502).json({ error: 'L’e-mail n’a pas pu être envoyé.' });
  }
});

// -----------------------------------------------------------------------------
// POST /api/admin/reminders/run
// Lance la tâche de rappel MANUELLEMENT (utile pour tester sans attendre minuit).
// -----------------------------------------------------------------------------
app.post('/api/admin/reminders/run', requireAdmin, async (_request, response) => {
  if (!emailIsConfigured()) {
    response.status(503).json({ error: 'Le service e-mail n’est pas configuré.' });
    return;
  }
  const result = await runDailyReminders();
  response.json({ message: `Rappels traités : ${result.sent} envoyé(s), ${result.skipped} ignoré(s).`, ...result });
});

// =============================================================================
// MODULE PLANNING — gestion des rendez-vous (back-office admin)
// =============================================================================
// Routes protégées par requireAdmin. Le calendrier côté site n'a besoin que
// des créneaux déjà pris (route publique /api/appointments/taken plus bas).
//
// GET /api/admin/appointments?month=YYYY-MM
//   → renvoie les RDV du mois + un résumé statistique (stats).
app.get('/api/admin/appointments', requireAdmin, (request, response) => {
  const month = typeof request.query.month === 'string' ? request.query.month.trim() : '';
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(month);
  let range;
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const monthIndex = Number(monthMatch[2]) - 1;
    // Premier jour du mois… et dernier jour du mois (via jour 0 du mois suivant).
    const from = new Date(year, monthIndex, 1);
    const to = new Date(year, monthIndex + 1, 0);
    range = { from: toDateInputValue(from), to: toDateInputValue(to) };
  }
  const items = appointments.list(range);
  const stats = appointments.stats(range);
  response.set('Cache-Control', 'no-store');
  response.json({ items, stats, month: month || null });
});

// POST /api/admin/appointments → crée un rendez-vous.
app.post('/api/admin/appointments', requireAdmin, (request, response) => {
  const parsed = appointmentInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Certaines informations du rendez-vous sont invalides.',
      fields: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
    });
    return;
  }
  const id = appointments.create(parsed.data);
  response.set('Cache-Control', 'no-store');
  response.status(201).json({ appointment: appointments.get(id) });
});

// PATCH /api/admin/appointments/:id → modifie un rendez-vous (champs partiels).
// On recharge le RDV existant, on fusionne, puis on revalide l'ensemble.
app.patch('/api/admin/appointments/:id', requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'Le rendez-vous sélectionné est invalide.' });
    return;
  }
  const existing = appointments.get(id);
  if (!existing) {
    response.status(404).json({ error: 'Ce rendez-vous n’existe plus.' });
    return;
  }
  const merged = { ...existing, ...(request.body || {}) };
  delete merged.id;
  delete merged.created_at;
  delete merged.updated_at;
  const parsed = appointmentInputSchema.safeParse(merged);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Certaines informations du rendez-vous sont invalides.',
      fields: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
    });
    return;
  }
  const updated = appointments.update(id, parsed.data);
  response.set('Cache-Control', 'no-store');
  response.json({ appointment: updated });
});

// DELETE /api/admin/appointments/:id → supprime un rendez-vous.
app.delete('/api/admin/appointments/:id', requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'Le rendez-vous sélectionné est invalide.' });
    return;
  }
  if (!appointments.delete(id)) {
    response.status(404).json({ error: 'Ce rendez-vous n’existe plus.' });
    return;
  }
  response.status(204).end();
});

// PATCH /api/admin/appointments/:id/paid → marque un RDV encaissé / non encaissé.
// Sert au suivi comptable dans le module "Comptabilité".
app.patch('/api/admin/appointments/:id/paid', requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'Le rendez-vous sélectionné est invalide.' });
    return;
  }
  const parsed = appointmentPaidSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Indiquez si le rendez-vous est encaissé.' });
    return;
  }
  const updated = appointments.markPaid(id, parsed.data.paid);
  if (!updated) {
    response.status(404).json({ error: 'Ce rendez-vous n’existe plus.' });
    return;
  }
  response.set('Cache-Control', 'no-store');
  response.json({ appointment: updated });
});

// -----------------------------------------------------------------------------
// GET /api/appointments/taken?month=YYYY-MM  (PUBLIC — pas de requireAdmin)
// Renvoie uniquement les dates/heures déjà occupées (sans les infos client),
// pour que le calendrier de la page Contact affiche les créneaux disponibles.
// On n'expose JAMAIS les données personnelles des clients ici.
// -----------------------------------------------------------------------------
app.get('/api/appointments/taken', (request, response) => {
  const month = typeof request.query.month === 'string' ? request.query.month.trim() : '';
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(month);
  let range;
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const monthIndex = Number(monthMatch[2]) - 1;
    range = {
      from: toDateInputValue(new Date(year, monthIndex, 1)),
      to: toDateInputValue(new Date(year, monthIndex + 1, 0))
    };
  }
  const items = appointments.list(range);
  // On ne renvoie que date/heure/durée des RDV non annulés (créneaux bloqués).
  const taken = items
    .filter((item) => item.status !== 'cancelled')
    .map((item) => ({ date: item.date, time: item.time, duration: item.duration }));
  response.set('Cache-Control', 'no-store');
  response.json({ taken });
});

// =============================================================================
// MODULE DEVIS — gestion commerciale (créer, envoyer, suivre)
// =============================================================================
// Routes protégées par requireAdmin. Permet de créer des devis chiffrés, de les
// envoyer par e-mail au client, et de suivre leur statut (brouillon → accepté).

// GET /api/admin/quotes → liste des devis (filtre ?status=) + statistiques.
app.get('/api/admin/quotes', requireAdmin, (request, response) => {
  const status = typeof request.query.status === 'string' ? request.query.status.trim() : '';
  response.set('Cache-Control', 'no-store');
  response.json({ items: quotes.list(status ? { status } : {}), stats: quotes.stats() });
});

// POST /api/admin/quotes → crée un devis (brouillon par défaut).
app.post('/api/admin/quotes', requireAdmin, (request, response) => {
  const parsed = quoteInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Certaines informations du devis sont invalides.',
      fields: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
    });
    return;
  }
  const id = quotes.create(parsed.data);
  response.set('Cache-Control', 'no-store');
  response.status(201).json({ quote: quotes.get(id) });
});

// PATCH /api/admin/quotes/:id → modifie un devis (champs partiels).
app.patch('/api/admin/quotes/:id', requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'Le devis sélectionné est invalide.' });
    return;
  }
  const existing = quotes.get(id);
  if (!existing) {
    response.status(404).json({ error: 'Ce devis n’existe plus.' });
    return;
  }
  // On fusionne avec l'existant puis on revalide l'ensemble (comme les RDV).
  const merged = {
    number: existing.number,
    client_name: existing.client_name,
    client_email: existing.client_email,
    client_phone: existing.client_phone,
    service: existing.service,
    items: existing.items,
    notes: existing.notes,
    valid_until: existing.valid_until || '',
    status: existing.status,
    ...(request.body || {})
  };
  delete merged.id;
  delete merged.total;
  delete merged.created_at;
  delete merged.updated_at;
  delete merged.sent_at;
  const parsed = quoteInputSchema.safeParse(merged);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Certaines informations du devis sont invalides.',
      fields: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
    });
    return;
  }
  const updated = quotes.update(id, parsed.data);
  response.set('Cache-Control', 'no-store');
  response.json({ quote: updated });
});

// DELETE /api/admin/quotes/:id → supprime un devis.
app.delete('/api/admin/quotes/:id', requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'Le devis sélectionné est invalide.' });
    return;
  }
  if (!quotes.delete(id)) {
    response.status(404).json({ error: 'Ce devis n’existe plus.' });
    return;
  }
  response.status(204).end();
});

// POST /api/admin/quotes/:id/send → envoie le devis par e-mail au client.
// Passe le statut "brouillon" à "envoyé" et mémorise la date d'envoi (sent_at).
app.post('/api/admin/quotes/:id/send', requireAdmin, async (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'Le devis sélectionné est invalide.' });
    return;
  }
  const quote = quotes.get(id);
  if (!quote) {
    response.status(404).json({ error: 'Ce devis n’existe plus.' });
    return;
  }
  if (!emailIsConfigured()) {
    response.status(503).json({ error: 'Le service e-mail n’est pas configuré. Renseignez les paramètres SMTP.' });
    return;
  }
  try {
    await sendQuoteEmail(quote);
    // On n'écrase pas un statut déjà accepté/refusé ; brouillon → envoyé.
    if (quote.status === 'draft') {
      quotes.update(id, { status: 'sent' });
    }
    quotes.markSent(id);
    response.set('Cache-Control', 'no-store');
    response.json({ quote: quotes.get(id), message: `Devis ${quote.number} envoyé à ${quote.client_email}.` });
  } catch (error) {
    console.error('Quote email delivery failed:', error.message);
    response.status(502).json({ error: 'L’e-mail n’a pas pu être envoyé. Vérifiez la configuration SMTP.' });
  }
});

// =============================================================================
// MODULE COMPTABILITÉ — vue d'ensemble (tableau de bord chiffre d'affaires)
// =============================================================================
app.post('/api/admin/accounting/entries', requireAdmin, (request, response) => {
  const parsed = accountingEntrySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Vérifiez les informations de l’écriture comptable.',
      fields: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
    });
    return;
  }
  const id = accountingEntries.create(parsed.data);
  response.status(201).json({ entry: accountingEntries.get(id) });
});

app.put('/api/admin/accounting/entries/:id', requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'Identifiant comptable invalide.' });
    return;
  }
  const parsed = accountingEntrySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Vérifiez les informations de l’écriture comptable.',
      fields: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
    });
    return;
  }
  const entry = accountingEntries.update(id, parsed.data);
  if (!entry) {
    response.status(404).json({ error: 'Cette écriture comptable n’existe plus.' });
    return;
  }
  response.json({ entry });
});

app.delete('/api/admin/accounting/entries/:id', requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: 'Identifiant comptable invalide.' });
    return;
  }
  if (!accountingEntries.delete(id)) {
    response.status(404).json({ error: 'Cette écriture comptable n’existe plus.' });
    return;
  }
  response.status(204).end();
});

app.get('/api/admin/accounting/entries', requireAdmin, (request, response) => {
  const yearParam = typeof request.query.year === 'string' ? request.query.year.trim() : '';
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getFullYear();
  const type = request.query.type === 'income' || request.query.type === 'expense' ? request.query.type : undefined;
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  response.set('Cache-Control', 'no-store');
  response.json({
    entries: accountingEntries.list({ from, to, type }),
    summary: accountingEntries.summary({ from, to })
  });
});

app.post('/api/admin/accounting/receipts', requireAdmin, receiptUpload.single('file'), async (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: 'Choisissez un justificatif à envoyer.' });
    return;
  }
  const detected = await fileTypeFromBuffer(request.file.buffer);
  const supported = new Map([
    ['pdf', 'document'], ['jpg', 'image'], ['png', 'image'], ['webp', 'image'],
    ['gif', 'image'], ['avif', 'image']
  ]);
  const kind = detected && supported.get(detected.ext);
  if (!detected || !kind || detected.mime !== request.file.mimetype || request.body.kind !== kind) {
    response.status(415).json({ error: 'Formats de justificatifs acceptés : PDF, JPEG, PNG, WebP, GIF et AVIF.' });
    return;
  }
  const filename = `${randomBytes(16).toString('hex')}.${detected.ext}`;
  try {
    await writeFile(resolve(accountingReceiptDirectory, filename), request.file.buffer, { flag: 'wx' });
  } catch (error) {
    console.error('Private accounting receipt save failed:', error.message);
    response.status(500).json({ error: 'Le justificatif n’a pas pu être enregistré.' });
    return;
  }
  response.status(201).json({ url: `/api/admin/accounting/receipts/${filename}`, kind });
});

app.get('/api/admin/accounting/receipts/:filename', requireAdmin, async (request, response) => {
  const filename = request.params.filename;
  if (!/^[a-f0-9]{32}\.(?:pdf|jpg|png|webp|gif|avif)$/.test(filename)) {
    response.status(400).json({ error: 'Nom de justificatif invalide.' });
    return;
  }
  try {
    const contents = await readFile(resolve(accountingReceiptDirectory, filename));
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff'
    });
    response.type(filename.split('.').pop());
    response.send(contents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      response.status(404).json({ error: 'Ce justificatif est introuvable.' });
      return;
    }
    console.error('Private accounting receipt read failed:', error.message);
    response.status(500).json({ error: 'Le justificatif n’a pas pu être lu.' });
  }
});

// GET /api/admin/accounting?year=YYYY → synthèse financière de l'année :
//   • chiffre d'affaires encaissé / en attente (rendez-vous)
//   • devis acceptés / en attente
//   • détail mois par mois
app.get('/api/admin/accounting', requireAdmin, (request, response) => {
  const yearParam = typeof request.query.year === 'string' ? request.query.year.trim() : '';
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  // Rendez-vous de l'année (encaissé, revenu, en attente).
  const appointmentStats = appointments.stats({ from, to });

  // Détail mois par mois : revenu + encaissé pour chaque mois de l'année.
  const monthly = [];
  for (let month = 1; month <= 12; month += 1) {
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const monthStats = appointments.stats({ from: `${monthPrefix}-01`, to: `${monthPrefix}-31` });
    monthly.push({
      month: monthPrefix,
      revenue: monthStats.revenue,
      collected: monthStats.collected,
      count: monthStats.total
    });
  }

  // Statistiques des devis (acceptés, en attente d'envoi, etc.).
  // La date de création du devis sert de date de suivi commerciale.
  // La borne de fin est exclusive dans le store : on utilise le 1er janvier suivant.
  const quoteStats = quotes.stats({ from, to: `${year + 1}-01-01` });

  response.set('Cache-Control', 'no-store');
  response.json({
    year,
    appointments: appointmentStats,
    quotes: quoteStats,
    ledger: accountingEntries.summary({ from, to }),
    monthly,
    // Total "business" = revenu RDV + devis acceptés (vue d'ensemble commerciale).
    potentialRevenue: appointmentStats.revenue + (quoteStats.acceptedRevenue || 0)
  });
});


app.put('/api/admin/content', requireAdmin, (request, response) => {
  const parsed = contentSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: 'Certains champs sont invalides. Vérifiez les textes et les fichiers choisis.',
      fields: parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message }))
    });
    return;
  }
  saveContent(parsed.data);
  response.json({ message: 'Les modifications ont bien été enregistrées.' });
});

app.post('/api/admin/uploads', requireAdmin, upload.single('file'), async (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: 'Choisissez un fichier à envoyer.' });
    return;
  }

  const detected = await fileTypeFromBuffer(request.file.buffer);
  const supported = new Map([
    ['jpg', 'image'], ['png', 'image'], ['webp', 'image'], ['gif', 'image'], ['avif', 'image'],
    ['mp4', 'video'], ['webm', 'video']
  ]);
  const kind = detected && supported.get(detected.ext);
  if (!detected || !kind || detected.mime !== request.file.mimetype || request.body.kind !== kind) {
    response.status(415).json({ error: 'Formats acceptés : JPEG, PNG, WebP, GIF, AVIF, MP4 et WebM.' });
    return;
  }

  const filename = `${randomBytes(16).toString('hex')}.${detected.ext}`;
  try {
    await writeFile(resolve(uploadDirectory, filename), request.file.buffer, { flag: 'wx' });
  } catch (error) {
    console.error('Upload save failed:', error.message);
    response.status(500).json({ error: 'Le fichier n’a pas pu être enregistré.' });
    return;
  }
  response.status(201).json({ url: `/uploads/${filename}`, kind });
});

app.use('/uploads', express.static(uploadDirectory, {
  dotfiles: 'deny',
  index: false,
  maxAge: production ? '1h' : 0,
  setHeaders(response) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'Cette route API est introuvable.' });
});

if (production) {
  const distDirectory = resolve(root, 'dist');
  app.use(express.static(distDirectory, { index: false }));
  app.get(/.*/, (request, response, next) => {
    if (request.path.startsWith('/api/') || request.path.startsWith('/uploads/')) {
      next();
      return;
    }
    response.sendFile(resolve(distDirectory, 'index.html'));
  });
}

app.use((error, _request, response, _next) => {
  if (response.headersSent) return;
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    response.status(status).json({
      error: error.code === 'LIMIT_FILE_SIZE'
        ? 'Le fichier dépasse la limite de 100 Mo.'
        : 'Le fichier n’a pas pu être traité.'
    });
    return;
  }
  console.error('Request failed:', error.message);
  response.status(error.status || 500).json({
    error: error.status ? error.message : 'Une erreur interne est survenue.'
  });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Tom Photo API listening on http://127.0.0.1:${port}`);
});

// -----------------------------------------------------------------------------
// PLANIFICATEUR DE RAPPELS
// Envoie les rappels "RDV demain" une fois au démarrage (après 30 s) puis toutes
// les 24 h. Idempotent et inoffensif si le SMTP n'est pas configuré.
// -----------------------------------------------------------------------------
const DAILY_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 heures
setTimeout(() => {
  runDailyReminders().catch((error) => console.error('Scheduled reminders failed:', error.message));
}, 30 * 1000).unref?.(); // premier passage 30 s après le démarrage
const reminderTimer = setInterval(() => {
  runDailyReminders().catch((error) => console.error('Scheduled reminders failed:', error.message));
}, DAILY_REMINDER_INTERVAL_MS);
reminderTimer.unref?.(); // ne bloque pas la fermeture du serveur
