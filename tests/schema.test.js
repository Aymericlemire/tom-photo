import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  accountingEntrySchema,
  contactRequestStatusSchema,
  contentSchema,
  contactSchema,
  crmActivitySchema,
  crmContactSchema
} from '../server/lib/schema.js';
import { migrateGalleryCategories } from '../server/lib/gallery-migration.js';
import { isAllowedOrigin } from '../server/lib/origin.js';

const defaultContent = JSON.parse(readFileSync(
  fileURLToPath(new URL('../server/default-content.json', import.meta.url)),
  'utf8'
));

test('the editable default content matches the public site schema', () => {
  assert.equal(contentSchema.safeParse(defaultContent).success, true);
});

test('accounting entries validate cents, dates, VAT and local receipt paths', () => {
  const valid = {
    type: 'expense',
    description: 'Achat carte mémoire',
    category: 'Matériel',
    amount: 1299,
    vat_rate: 20,
    entry_date: '2027-03-11',
    payment_date: '',
    receipt_url: '/api/admin/accounting/receipts/0123456789abcdef0123456789abcdef.pdf'
  };
  assert.equal(accountingEntrySchema.safeParse(valid).success, true);
  assert.equal(accountingEntrySchema.safeParse({ ...valid, entry_date: '2027-02-30' }).success, false);
  assert.equal(accountingEntrySchema.safeParse({ ...valid, vat_rate: 17 }).success, false);
  assert.equal(accountingEntrySchema.safeParse({ ...valid, amount: 12.99 }).success, false);
  assert.equal(accountingEntrySchema.safeParse({ ...valid, receipt_url: 'https://example.com/receipt.pdf' }).success, false);
});

test('CRM contacts and follow-up activities validate identity, pipeline and dates', () => {
  const contact = {
    name: 'Camille Martin',
    email: 'camille@example.invalid',
    phone: '0612345678',
    company: '',
    stage: 'qualified',
    notes: ''
  };
  assert.equal(crmContactSchema.safeParse(contact).success, true);
  assert.equal(crmContactSchema.safeParse({ ...contact, email: 'not-an-email' }).success, false);
  assert.equal(crmContactSchema.safeParse({ ...contact, stage: 'unknown' }).success, false);

  const task = {
    kind: 'task',
    title: 'Rappeler le client',
    details: '',
    due_date: '2027-03-11'
  };
  assert.equal(crmActivitySchema.safeParse(task).success, true);
  assert.equal(crmActivitySchema.safeParse({ ...task, due_date: '' }).success, false);
  assert.equal(crmActivitySchema.safeParse({ ...task, due_date: '2027-02-30' }).success, false);
  assert.equal(crmActivitySchema.safeParse({ ...task, kind: 'note', due_date: '' }).success, true);
});

test('visual home canvas supports exact positioned blocks and rejects blocks outside its design bounds', () => {
  const editable = structuredClone(defaultContent);
  editable.home.canvas = {
    enabled: true,
    elements: [{
      id: 'titre-principal', type: 'heading', x: 120, y: 90, width: 800, height: 100,
      content: 'Bienvenue', href: '/contact', src: '/images/portrait.jpg',
      fontSize: 72, color: '#ffffff', background: ''
    }]
  };
  assert.equal(contentSchema.safeParse(editable).success, true);
  editable.home.canvas.elements[0].x = 500;
  assert.equal(contentSchema.safeParse(editable).success, false);
});

test('editorial page canvases accept long layouts and reject elements outside their page', () => {
  const editable = structuredClone(defaultContent);
  editable.pageCanvases.expertise = {
    enabled: true,
    height: 1400,
    background: '#f7f4ef',
    elements: [{
      id: 'intro-longue', type: 'text', x: 80, y: 900, width: 1000, height: 300,
      content: 'Texte de page', href: '/contact', src: '/images/portrait.jpg',
      fontSize: 20, color: '#342a20', background: ''
    }]
  };
  assert.equal(contentSchema.safeParse(editable).success, true);
  editable.pageCanvases.expertise.height = 1100;
  assert.equal(contentSchema.safeParse(editable).success, false);
  editable.pageCanvases.expertise.height = 1400;
  editable.pageCanvases.expertise.elements[0].href = 'https://example.invalid';
  assert.equal(contentSchema.safeParse(editable).success, false);
});

test('editable image fields only accept local site or uploaded media', () => {
  const invalid = structuredClone(defaultContent);
  invalid.home.cards[0].image = 'javascript:alert(1)';
  assert.equal(contentSchema.safeParse(invalid).success, false);
  const withoutHeroVideo = structuredClone(defaultContent);
  withoutHeroVideo.home.heroVideo = '';
  assert.equal(contentSchema.safeParse(withoutHeroVideo).success, true);
});

test('editable navigation is limited to existing internal pages', () => {
  const invalid = structuredClone(defaultContent);
  invalid.site.navigation[0].path = 'https://unknown.example';
  assert.equal(contentSchema.safeParse(invalid).success, false);
  const duplicate = structuredClone(defaultContent);
  duplicate.site.navigation[1].path = '/';
  assert.equal(contentSchema.safeParse(duplicate).success, false);
  assert.equal(contactRequestStatusSchema.safeParse('confirmed').success, true);
  assert.equal(contactRequestStatusSchema.safeParse('admin').success, false);
});

test('contact calendar accepts only unique real unavailable dates', () => {
  const editable = structuredClone(defaultContent);
  editable.contact.unavailableDates = ['2027-02-28'];
  assert.equal(contentSchema.safeParse(editable).success, true);
  editable.contact.unavailableDates = ['2027-02-30'];
  assert.equal(contentSchema.safeParse(editable).success, false);
  editable.contact.unavailableDates = ['2027-02-28', '2027-02-28'];
  assert.equal(contentSchema.safeParse(editable).success, false);
});

test('gallery photos can use uploaded images and start with the expertise categories', () => {
  const editable = structuredClone(defaultContent);
  editable.gallery.cards[0].image = '/uploads/gallery-photo.jpg';
  assert.equal(contentSchema.safeParse(editable).success, true);
  editable.gallery.cards[0].image = 'https://example.com/photo.jpg';
  assert.equal(contentSchema.safeParse(editable).success, false);
});

test('gallery photos belong to existing categories and can scale beyond the old card limit', () => {
  const editable = structuredClone(defaultContent);
  const photo = { ...editable.gallery.cards[0], title: 'Portrait en extérieur', category: 'Portrait' };
  editable.gallery.cards = [...editable.gallery.cards, ...Array.from({ length: 25 }, (_, index) => ({
    ...photo,
    title: `Photo ${index + 1}`
  }))];
  assert.equal(contentSchema.safeParse(editable).success, true);
  editable.gallery.cards[0].category = 'Catégorie inconnue';
  assert.equal(contentSchema.safeParse(editable).success, false);
  editable.gallery.categories.push('PORTRAIT');
  assert.equal(contentSchema.safeParse(editable).success, false);
});

test('gallery cards support photo or video types and optional sub-groups', () => {
  const editable = structuredClone(defaultContent);
  const photoCard = editable.gallery.cards[0];
  assert.equal(photoCard.type, 'photo');
  assert.equal(photoCard.group, 'Portrait seul');
  const videoCard = editable.gallery.cards.find((card) => card.type === 'video');
  assert.equal(videoCard.video, '/media/DJI_0331.mp4');
  assert.equal(contentSchema.safeParse(editable).success, true);

  const missingVideo = structuredClone(editable);
  missingVideo.gallery.cards = missingVideo.gallery.cards.map((card) => (
    card.type === 'video' ? { ...card, video: '' } : card
  ));
  assert.equal(contentSchema.safeParse(missingVideo).success, false);

  const externalVideo = structuredClone(editable);
  const firstVideoIndex = externalVideo.gallery.cards.findIndex((card) => card.type === 'video');
  externalVideo.gallery.cards[firstVideoIndex].video = 'https://example.com/clip.mp4';
  assert.equal(contentSchema.safeParse(externalVideo).success, false);
});

test('home testimonials are validated and capped', () => {
  const editable = structuredClone(defaultContent);
  assert.ok(editable.home.testimonials.length > 0);
  assert.equal(contentSchema.safeParse(editable).success, true);
  const invalid = structuredClone(defaultContent);
  invalid.home.testimonials[0].name = '';
  assert.equal(contentSchema.safeParse(invalid).success, false);
  const tooMany = structuredClone(defaultContent);
  tooMany.home.testimonials = Array.from({ length: 25 }, () => ({ ...tooMany.home.testimonials[0] }));
  assert.equal(contentSchema.safeParse(tooMany).success, false);
});

test('gallery migration adds sub-group, type and video defaults to legacy cards', () => {
  const legacy = {
    title: 'Portfolio',
    intro: '',
    categories: ['Portrait'],
    cards: [{ title: 'Ancienne photo', image: '/images/portrait.jpg', description: '', category: 'Portrait' }]
  };
  const migrated = migrateGalleryCategories(legacy, structuredClone(legacy), defaultContent.gallery);
  assert.equal(migrated.cards[0].group, '');
  assert.equal(migrated.cards[0].type, 'photo');
  assert.equal(migrated.cards[0].video, '');
});

test('gallery category migration keeps existing photos and groups legacy cards by their former title', () => {
  const legacy = {
    title: 'Portfolio',
    intro: '',
    cards: [
      { title: 'Portraits', image: '/images/portrait.jpg', description: 'Première photo' },
      { title: 'Portraits', image: '/images/portrait.jpg', description: 'Deuxième photo' },
      { title: 'Mariage', image: '/images/mariage.jpg', description: 'Cérémonie' }
    ]
  };
  const migrated = migrateGalleryCategories(legacy, legacy, defaultContent.gallery);
  assert.deepEqual(migrated.categories, ['Portraits', 'Mariage']);
  assert.deepEqual(migrated.cards.map((item) => item.category), ['Portraits', 'Portraits', 'Mariage']);
});

test('admin API permits configured, same-origin, and local Vite requests only', () => {
  const allowedOrigins = new Set([
    'http://127.0.0.1:5173', 'http://localhost:5173',
    'http://127.0.0.1:5175', 'http://localhost:5175'
  ]);
  assert.equal(isAllowedOrigin('http://localhost:5173', 'http://127.0.0.1:5174', allowedOrigins), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5175', 'http://127.0.0.1:5174', allowedOrigins), true);
  assert.equal(isAllowedOrigin('http://localhost:5175', 'http://127.0.0.1:5174', allowedOrigins), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5174', 'http://127.0.0.1:5174', allowedOrigins), true);
  assert.equal(isAllowedOrigin('https://unknown.example', 'http://127.0.0.1:5174', allowedOrigins), false);
  assert.equal(isAllowedOrigin('not-a-url', 'http://127.0.0.1:5174', allowedOrigins), false);
});

test('contact submissions require a real, future calendar date', () => {
  const request = {
    name: 'Camille Exemple',
    email: 'camille@example.com',
    phone: '',
    service: 'Portrait',
    date: '2099-02-30',
    time: '',
    location: '',
    message: 'Je souhaite un devis pour une séance photo.'
  };
  assert.equal(contactSchema.safeParse(request).success, false);
});

test('contact submissions reject a filled honeypot field', () => {
  const request = {
    name: 'Camille Exemple',
    email: 'camille@example.com',
    phone: '',
    service: 'Portrait',
    date: '',
    time: '',
    location: '',
    message: 'Je souhaite un devis pour une séance photo.',
    website: 'spam.example'
  };
  assert.equal(contactSchema.safeParse(request).success, false);
});
