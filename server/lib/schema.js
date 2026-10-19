import { z } from 'zod';

const shortText = z.string().trim().max(240);
const imagePath = z.string().trim().max(500).refine(
  (value) => value.startsWith('/images/') || value.startsWith('/uploads/'),
  'Choisissez une image du site ou téléversez-en une.'
);
const videoPath = z.string().trim().max(500).refine(
  (value) => value === '' || value.startsWith('/media/') || value.startsWith('/uploads/'),
  'Choisissez une vidéo du site ou téléversez-en une.'
);
const card = z.object({
  title: shortText,
  image: imagePath,
  description: z.string().trim().max(1200)
}).strict();
const canvasElement = z.object({
  id: z.string().trim().regex(/^[a-z0-9-]{1,40}$/),
  type: z.enum(['text', 'heading', 'button', 'image']),
  x: z.number().int().min(0).max(1200),
  y: z.number().int().min(0).max(675),
  width: z.number().int().min(30).max(1200),
  height: z.number().int().min(20).max(675),
  content: z.string().trim().max(600).default('Nouveau texte'),
  href: z.enum(['/', '/galerie', '/expertises', '/tarifs', '/qui-suis-je', '/contact']).default('/contact'),
  src: imagePath.default('/images/portrait.jpg'),
  fontSize: z.number().int().min(10).max(160).default(28),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
  background: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/).default('')
}).strict().superRefine((element, context) => {
  if (element.x + element.width > 1200) {
    context.addIssue({ code: 'custom', path: ['width'], message: 'L’élément doit rester dans la largeur du canevas (1200 px).' });
  }
  if (element.y + element.height > 675) {
    context.addIssue({ code: 'custom', path: ['height'], message: 'L’élément doit rester dans la hauteur du canevas (675 px).' });
  }
});
const siteCanvasElement = z.object({
  id: z.string().trim().regex(/^[a-z0-9-]{1,40}$/),
  type: z.enum(['text', 'heading', 'button', 'image']),
  x: z.number().int().min(0).max(1200),
  y: z.number().int().min(0).max(5000),
  width: z.number().int().min(30).max(1200),
  height: z.number().int().min(20).max(1600),
  content: z.string().trim().max(2000).default('Nouveau texte'),
  href: z.enum(['/', '/galerie', '/expertises', '/tarifs', '/qui-suis-je', '/contact']).default('/contact'),
  src: imagePath.default('/images/portrait.jpg'),
  fontSize: z.number().int().min(10).max(160).default(28),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#342a20'),
  background: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/).default('')
}).strict().superRefine((element, context) => {
  if (element.x + element.width > 1200) {
    context.addIssue({ code: 'custom', path: ['width'], message: 'L’élément doit rester dans la largeur du canevas (1200 px).' });
  }
});
const pageCanvas = z.object({
  enabled: z.boolean().default(false),
  height: z.number().int().min(675).max(5000).default(1200),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f7f4ef'),
  elements: z.array(siteCanvasElement).max(120).default([])
}).strict().superRefine((canvas, context) => {
  canvas.elements.forEach((element, index) => {
    if (element.y + element.height > canvas.height) {
      context.addIssue({
        code: 'custom',
        path: ['elements', index, 'height'],
        message: 'L’élément doit rester dans la hauteur du canevas.'
      });
    }
  });
}).default({ enabled: false, height: 1200, background: '#f7f4ef', elements: [] });

// --- Carte de la GALERIE -----------------------------------------------------
// Même base qu'une "card" + des champs propres à la galerie :
//   - category : la catégorie (Portrait, Mariage, "Drone et Vidéos"…)
//   - group    : le SOUS-GROUPE dans la catégorie (ex. "Portrait seul", "Drone")
//                vide par défaut = pas de sous-groupe
//   - type     : "photo" ou "video"
//   - video    : chemin du fichier vidéo (vide pour une photo)
const galleryCard = card.extend({
  category: shortText.min(1),
  group: shortText.default(''),
  type: z.enum(['photo', 'video']).default('photo'),
  video: videoPath.default('')
});

// --- Avis client (témoignage) ------------------------------------------------
// Affiché en bas de la page d'accueil. Contenu éditable dans l'admin.
const testimonial = z.object({
  name: shortText.min(1),              // Nom du client (ex. "Camille & Théo")
  role: shortText.min(1),              // Contexte (ex. "Mariage à Niort")
  message: z.string().trim().min(1).max(600)  // Le texte de l'avis
}).strict();

export const contentSchema = z.object({
  site: z.object({
    brand: shortText,
    tagline: z.string().trim().max(600),
    logo: imagePath,
    email: z.string().trim().email().max(254),
    phone: shortText,
    city: shortText,
    navigation: z.array(z.object({
      label: shortText,
      path: z.enum(['/', '/galerie', '/expertises', '/tarifs', '/qui-suis-je', '/contact'])
    }).strict()).max(6).superRefine((items, context) => {
      const paths = new Set();
      items.forEach((item, index) => {
        if (paths.has(item.path)) {
          context.addIssue({ code: 'custom', path: [index, 'path'], message: 'Chaque page ne peut apparaître qu’une fois dans le menu.' });
        }
        paths.add(item.path);
      });
    })
  }).strict(),
  home: z.object({
    eyebrow: shortText,
    title: shortText,
    subtitle: shortText,
    heroImage: imagePath,
    heroVideo: videoPath,
    // Repère de création de 1200 × 675 px : les positions sont enregistrées
    // en pixels puis mises à l'échelle pour les écrans plus petits.
    canvas: z.object({
      enabled: z.boolean().default(false),
      elements: z.array(canvasElement).max(60).default([])
    }).strict().default({ enabled: false, elements: [] }),
    sectionEyebrow: shortText,
    sectionTitle: shortText,
    sectionIntro: z.string().trim().max(1200),
    galleryAction: shortText,
    pricingAction: shortText,
    storyAction: shortText,
    // --- Section "Vos retours" (avis clients) affichée en bas de l'accueil ---
    testimonialsEyebrow: shortText,   // Petite accroche au-dessus du titre
    testimonialsTitle: shortText,     // Titre de la section (ex. "Vos retours")
    testimonials: z.array(testimonial).max(24),  // La liste des avis (max 24)
    cards: z.array(card).max(16)
  }).strict(),
  pageCanvases: z.object({
    expertise: pageCanvas,
    pricing: pageCanvas,
    about: pageCanvas
  }).strict().default({
    expertise: { enabled: false, height: 1500, background: '#f7f4ef', elements: [] },
    pricing: { enabled: false, height: 1800, background: '#f7f4ef', elements: [] },
    about: { enabled: false, height: 1300, background: '#f7f4ef', elements: [] }
  }),
  gallery: z.object({
    title: shortText,
    intro: z.string().trim().max(1200),
    categories: z.array(shortText.min(1)).min(1).max(24).superRefine((items, context) => {
      const categories = new Set();
      items.forEach((category, index) => {
        const normalized = category.toLocaleLowerCase('fr-FR');
        if (categories.has(normalized)) {
          context.addIssue({ code: 'custom', path: [index], message: 'Les catégories doivent avoir des noms uniques.' });
        }
        categories.add(normalized);
      });
    }),
    // Les photos de la galerie. Chaque carte doit appartenir à une catégorie
    // existante, et si c'est une vidéo (type "video") elle DOIT avoir un fichier.
    cards: z.array(galleryCard).max(120)
  }).strict().superRefine((gallery, context) => {
    const categories = new Set(gallery.categories);
    gallery.cards.forEach((photo, index) => {
      if (!categories.has(photo.category)) {
        context.addIssue({ code: 'custom', path: ['cards', index, 'category'], message: 'Choisissez une catégorie existante.' });
      }
      if (photo.type === 'video' && !photo.video) {
        context.addIssue({ code: 'custom', path: ['cards', index, 'video'], message: 'Une carte vidéo doit avoir une vidéo.' });
      }
    });
  }),
  expertise: z.object({
    title: shortText,
    intro: z.string().trim().max(1200),
    eyebrow: shortText,
    cardAction: shortText,
    cards: z.array(card).max(16)
  }).strict(),
  pricing: z.object({
    title: shortText,
    intro: z.string().trim().max(1200),
    eyebrow: shortText,
    cardAction: shortText,
    weddingEyebrow: shortText,
    weddingTitle: shortText,
    weddingAction: shortText,
    cards: z.array(z.object({
      title: shortText,
      image: imagePath,
      details: shortText,
      price: shortText
    }).strict()).max(16),
    weddings: z.array(z.object({
      title: shortText,
      price: shortText,
      description: z.string().trim().max(1200)
    }).strict()).max(12)
  }).strict(),
  about: z.object({
    title: shortText,
    intro: shortText,
    sectionTitle: shortText,
    paragraphs: z.array(z.string().trim().max(2000)).max(12),
    image: imagePath
  }).strict(),
  contact: z.object({
    title: shortText,
    intro: z.string().trim().max(1200),
    eyebrow: shortText,
    panelEyebrow: shortText,
    panelTitle: shortText,
    panelDescription: z.string().trim().max(1200),
    zoneLabel: shortText,
    formTitle: shortText,
    formIntro: z.string().trim().max(1200),
    calendarEyebrow: shortText,
    calendarTitle: shortText,
    calendarOptional: shortText,
    calendarSelectedPrefix: shortText,
    calendarSelectHint: z.string().trim().max(1200),
    calendarNoTimes: z.string().trim().max(1200),
    calendarNote: z.string().trim().max(1200),
    reservationNote: z.string().trim().max(1200),
    calendarUnavailable: z.string().trim().max(1200),
    servicePlaceholder: shortText,
    projectPlaceholder: shortText,
    nameLabel: shortText,
    emailLabel: shortText,
    phoneLabel: shortText,
    serviceLabel: shortText,
    locationLabel: shortText,
    messageLabel: shortText,
    submitLabel: shortText,
    services: z.array(shortText).max(24),
    times: z.array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)).max(24),
    unavailableDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    })).max(500).superRefine((dates, context) => {
      if (new Set(dates).size !== dates.length) {
        context.addIssue({ code: 'custom', message: 'Une date indisponible ne peut être ajoutée qu’une fois.' });
      }
    })
  }).strict(),
  footer: z.object({
    about: z.string().trim().max(1200),
    locations: z.string().trim().max(600),
    navigationTitle: shortText,
    contactTitle: shortText,
    adminLabel: shortText,
    socialLinks: z.array(z.object({
      label: shortText,
      url: z.string().url().max(1000).refine((value) => value.startsWith('https://'))
    }).strict()).max(12)
  }).strict()
}).strict();

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40),
  service: z.string().trim().min(1).max(100),
  date: z.string().trim().max(10).regex(/^$|^\d{4}-\d{2}-\d{2}$/),
  time: z.string().trim().max(5).regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/),
  location: z.string().trim().max(160),
  message: z.string().trim().min(5).max(4000),
  website: z.string().max(0).optional()
}).strict().superRefine((data, context) => {
  if (!data.date) return;
  const [year, month, day] = data.date.split('-').map(Number);
  const requestedDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (requestedDate.getFullYear() !== year || requestedDate.getMonth() !== month - 1 ||
      requestedDate.getDate() !== day || requestedDate < today) {
    context.addIssue({ code: 'custom', path: ['date'], message: 'Choisissez une date future valide.' });
  }
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200)
}).strict();

export const contactRequestStatusSchema = z.enum(['new', 'contacted', 'confirmed', 'closed']);

export const crmStageSchema = z.enum([
  'lead', 'contacted', 'qualified', 'quote_sent', 'booked', 'customer', 'lost'
]);

const optionalEmail = z.string().trim().max(254).refine(
  (value) => value === '' || z.email().safeParse(value).success,
  'Saisissez une adresse e-mail valide ou laissez le champ vide.'
);

export const crmContactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: optionalEmail.default(''),
  phone: z.string().trim().max(40).default(''),
  company: z.string().trim().max(120).default(''),
  stage: crmStageSchema.default('lead'),
  notes: z.string().trim().max(4000).default('')
}).strict();

export const crmContactUpdateSchema = crmContactSchema.partial().strict().refine(
  (data) => Object.keys(data).length > 0,
  'Modifiez au moins un champ du contact.'
);

export const crmActivitySchema = z.object({
  kind: z.enum(['note', 'task']),
  title: z.string().trim().min(2).max(160),
  details: z.string().trim().max(2000).default(''),
  due_date: z.string().trim().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default('')
}).strict().superRefine((data, context) => {
  if (data.kind === 'task' && !data.due_date) {
    context.addIssue({ code: 'custom', path: ['due_date'], message: 'Choisissez une date de relance.' });
    return;
  }
  if (data.due_date) {
    const [year, month, day] = data.due_date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      context.addIssue({ code: 'custom', path: ['due_date'], message: 'Choisissez une date réelle.' });
    }
  }
});

export const crmActivityCompletionSchema = z.object({
  completed: z.boolean()
}).strict();

// --- Rendez-vous (module Planning) ------------------------------------------
// Statuts de suivi d'un rendez-vous :
//   pending   → en attente (demande reçue, pas encore confirmée)
//   confirmed → confirmé par Tom (créneau bloqué)
//   cancelled → annulé (créneau libéré)
//   completed → terminé / honoré
export const appointmentStatusSchema = z.enum(['pending', 'confirmed', 'cancelled', 'completed']);

// SQLite stocke les booléens en 0/1 : on accepte les deux formes à l’entrée.
const sqliteBoolean = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((value) => value === true || value === 1);

// Un rendez-vous saisi manuellement dans l'admin (création et modification).
// Le prix est stocké en centimes : on accepte un montant positif entier.
export const appointmentInputSchema = z.object({
  client_name: z.string().trim().min(2).max(100),
  client_email: z.string().trim().email().max(254),
  client_phone: z.string().trim().max(40).default(''),
  service: z.string().trim().max(100).default(''),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choisissez une date au format AAAA-MM-JJ.'),
  time: z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Choisissez une heure au format HH:MM.'),
  duration: z.number().int().min(15).max(24 * 60).default(60),
  price: z.number().int().min(0).max(100_000_000).default(0),
  paid: sqliteBoolean.optional().default(false),
  notes: z.string().trim().max(2000).default(''),
  status: appointmentStatusSchema.default('pending')
}).strict();

// Marque "encaissé / non encaissé" d'un rendez-vous (suivi compta).
export const appointmentPaidSchema = z.object({
  paid: z.boolean()
}).strict();

// --- Devis (module commercial) ----------------------------------------------
// Statuts d'un devis :
//   draft     → brouillon (pas encore envoyé)
//   sent      → envoyé au client (en attente de réponse)
//   accepted  → accepté par le client (chiffre d'affaires potentiel)
//   refused   → refusé
//   expired   → expiré (date de validité dépassée)
//   cancelled → annulé par le studio
export const quoteStatusSchema = z.enum(['draft', 'sent', 'accepted', 'refused', 'expired', 'cancelled']);

// Une ligne de devis : description, quantité, prix unitaire en centimes.
export const quoteItemSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1).max(1000).default(1),
  unit_price: z.number().int().min(0).max(100_000_000).default(0)
}).strict();

// Devis saisi dans l'admin (création et modification). Le total est recalculé
// côté serveur à partir des lignes (on ne fait donc pas confiance au client).
export const quoteInputSchema = z.object({
  number: z.string().trim().max(40).optional(),   // vide = généré automatiquement
  client_name: z.string().trim().min(2).max(100),
  client_email: z.string().trim().email().max(254),
  client_phone: z.string().trim().max(40).default(''),
  service: z.string().trim().max(100).default(''),
  items: z.array(quoteItemSchema).min(1).max(50),
  notes: z.string().trim().max(2000).default(''),
  valid_until: z.string().trim().regex(/^$|^\d{4}-\d{2}-\d{2}$/, 'Choisissez une date de validité au format AAAA-MM-JJ.').default(''),
  status: quoteStatusSchema.default('draft')
}).strict();

// Changement de statut d'un devis (menu déroulant dans l'admin).
export const quoteStatusUpdateSchema = z.object({
  status: quoteStatusSchema
}).strict();

// Une écriture comptable utilise des centimes et un taux indicatif de TVA.
// Les justificatifs doivent pointer vers un fichier du dossier d'uploads.
export const accountingEntrySchema = z.object({
  type: z.enum(['income', 'expense']),
  description: z.string().trim().min(1).max(240),
  category: z.string().trim().min(1).max(80),
  counterparty: z.string().trim().max(160).default(''),
  amount: z.number().int().min(0).max(100_000_000),
  vat_rate: z.number().refine((value) => [0, 5.5, 10, 20].includes(value), 'Choisissez un taux de TVA proposé.').default(0),
  entry_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_date: z.string().trim().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(''),
  receipt_url: z.string().trim().max(500).refine(
    (value) => value === '' || /^\/api\/admin\/accounting\/receipts\/[a-f0-9]{32}\.(?:pdf|jpg|png|webp|gif|avif)$/.test(value),
    'Choisissez un justificatif PDF ou image téléversé.'
  ).default(''),
  notes: z.string().trim().max(2000).default('')
}).strict().superRefine((data, context) => {
  for (const field of ['entry_date', 'payment_date']) {
    const value = data[field];
    if (!value) continue;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      context.addIssue({ code: 'custom', path: [field], message: 'Choisissez une date réelle au format AAAA-MM-JJ.' });
    }
  }
});
