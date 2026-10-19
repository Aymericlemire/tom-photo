// email.js
// -----------------------------------------------------------------------------
// Envoi des e-mails via Nodemailer (SMTP configuré dans le fichier .env).
// 3 types d'e-mails :
//   1. sendContactEmail   → le DEVIS, envoyé à Tom à chaque nouvelle demande
//   2. sendConfirmationEmail → CONFIRMATION au client quand le RDV est confirmé
//   3. sendReminderEmail  → RAPPEL au client la veille du rendez-vous
// Si le SMTP n'est pas configuré, chaque fonction renvoie une erreur 503.
// -----------------------------------------------------------------------------
import nodemailer from 'nodemailer';

// Vrai seulement si TOUS les réglages SMTP nécessaires sont présents.
export const emailIsConfigured = (env = process.env) => Boolean(
  env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD &&
  env.SMTP_FROM && env.CONTACT_TO
);

// Fabrique la "connexion" au serveur d'envoi (réutilisée par les 3 fonctions).
function createTransporter(env) {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: env.SMTP_SECURE === 'true',
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
  });
}

// Met en forme les infos du rendez-vous (prestation, date en français, horaire, lieu).
function formatAppointment(data) {
  const parts = [];
  if (data.service) parts.push(`Prestation : ${data.service}`);
  if (data.date) {
    let dateLabel = data.date;
    try {
      dateLabel = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date(`${data.date}T00:00:00`));
    } catch { /* si la date est invalide, on garde la valeur brute */ }
    parts.push(`Date : ${dateLabel}`);
  }
  if (data.time) parts.push(`Horaire : ${data.time}`);
  if (data.location) parts.push(`Lieu : ${data.location}`);
  return parts.join('\n');
}

// 1) DEVIS → envoyé à Tom (CONTACT_TO) dès qu'un visiteur remplit le formulaire.
export async function sendContactEmail(data, env = process.env) {
  if (!emailIsConfigured(env)) {
    const error = new Error('Le service e-mail n’est pas configuré.');
    error.status = 503;
    throw error;
  }

  const transporter = createTransporter(env);

  const details = [
    `Nom : ${data.name}`,
    `Adresse e-mail : ${data.email}`,
    `Téléphone : ${data.phone || 'Non renseigné'}`,
    `Prestation : ${data.service}`,
    `Date souhaitée : ${data.date || 'Non renseignée'}`,
    `Horaire indicatif : ${data.time || 'Non renseigné'}`,
    `Lieu : ${data.location || 'Non renseigné'}`,
    '',
    'Message :',
    data.message
  ].join('\n');

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: env.CONTACT_TO,
      replyTo: data.email,
      subject: `Demande de devis — ${data.service}`,
      text: details
    });
  } finally {
    transporter.close();
  }
}

// 2) CONFIRMATION → envoyée AU CLIENT quand le RDV passe en "Confirmée" dans l'admin.
export async function sendConfirmationEmail(data, env = process.env) {
  if (!emailIsConfigured(env)) {
    const error = new Error('Le service e-mail n’est pas configuré.');
    error.status = 503;
    throw error;
  }

  const transporter = createTransporter(env);
  const appointment = formatAppointment(data);

  const body = [
    `Bonjour ${data.name},`,
    '',
    'Bonne nouvelle : votre rendez-vous est confirmé !',
    '',
    appointment,
    '',
    'Nous avons hâte de vous rencontrer. Si vous avez la moindre question ou un imprévu, répondez simplement à cet e-mail.',
    '',
    'À très bientôt,',
    'Tom — Photographe & vidéaste'
  ].join('\n');

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: data.email,
      replyTo: env.CONTACT_TO,
      subject: 'Votre rendez-vous est confirmé — Tom Photo',
      text: body
    });
  } finally {
    transporter.close();
  }
}

// 3) RAPPEL → envoyé AU CLIENT la veille du rendez-vous (tâche automatique).
export async function sendReminderEmail(data, env = process.env) {
  if (!emailIsConfigured(env)) {
    const error = new Error('Le service e-mail n’est pas configuré.');
    error.status = 503;
    throw error;
  }

  const transporter = createTransporter(env);
  const appointment = formatAppointment(data);

  const body = [
    `Bonjour ${data.name},`,
    '',
    'Un petit rappel : votre rendez-vous avec Tom a lieu demain !',
    '',
    appointment,
    '',
    'Pensez à prévoir un peu de temps pour arriver détendu. Nous avons hâte de vous voir.',
    '',
    'À demain,',
    'Tom — Photographe & vidéaste'
  ].join('\n');

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: data.email,
      replyTo: env.CONTACT_TO,
      subject: 'Rappel : votre rendez-vous est demain — Tom Photo',
      text: body
    });
  } finally {
    transporter.close();
  }
}

// Met en forme un montant en centimes en euros lisible.
function euro(cents) {
  return `${(Number(cents || 0) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

// Formate une date AAAA-MM-JJ en français lisible (ex. "12 juin 2026").
function formatDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

export function appointmentToMailData(appointment) {
  return {
    name: appointment.client_name,
    email: appointment.client_email,
    phone: appointment.client_phone,
    service: appointment.service,
    date: appointment.date,
    time: appointment.time
  };
}

// 4) DEVIS CLIENT → envoyé AU CLIENT depuis le module "Devis" de l'admin.
// `quote` est l'objet devis complet : number, client_*, items[], total, valid_until, notes.
export async function sendQuoteEmail(quote, env = process.env) {
  if (!emailIsConfigured(env)) {
    const error = new Error('Le service e-mail n’est pas configuré.');
    error.status = 503;
    throw error;
  }

  const transporter = createTransporter(env);

  const lines = (quote.items || []).map((item) => {
    const quantity = Number(item.quantity) || 1;
    const lineTotal = euro(quantity * (Number(item.unit_price) || 0));
    return `• ${item.description} — ${quantity} × ${euro(item.unit_price)} = ${lineTotal}`;
  });

  const body = [
    `Bonjour ${quote.client_name},`,
    '',
    `Comme convenu, voici votre devis n° ${quote.number}.`,
    '',
    quote.service ? `Prestation : ${quote.service}` : '',
    '',
    'Détail du devis :',
    ...lines,
    '',
    `Total : ${euro(quote.total)}`,
    '',
    quote.valid_until ? `Ce devis est valable jusqu’au ${formatDate(quote.valid_until)}.` : '',
    quote.notes ? `Note : ${quote.notes}` : '',
    '',
    'N’hésitez pas à répondre à cet e-mail pour valider le devis ou me poser vos questions.',
    '',
    'À très bientôt,',
    'Tom — Photographe & vidéaste'
  ].filter((line) => line !== undefined).join('\n');

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: quote.client_email,
      replyTo: env.CONTACT_TO,
      subject: `Votre devis ${quote.number} — Tom Photo`,
      text: body
    });
  } finally {
    transporter.close();
  }
}

