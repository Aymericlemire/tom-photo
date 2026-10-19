import { normalizeQuoteItems } from './quote-format.js';

const PAGE = { width: 210, height: 297, left: 15, right: 195 };
const COLORS = {
  brown: [69, 49, 34],
  muted: [116, 101, 83],
  gold: [184, 145, 80],
  light: [246, 241, 233],
  line: [226, 217, 204]
};

const money = (cents = 0) => `${(cents / 100).toLocaleString('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})} €`;

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
};

const receiptVat = (entry) => entry.vat_rate > 0
  ? entry.amount - Math.round(entry.amount * 100 / (100 + entry.vat_rate))
  : 0;

async function fetchLogo(logoUrl) {
  const response = await fetch(logoUrl, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Le logo du site ne peut pas être chargé (HTTP ${response.status}).`);
  const blob = await response.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Le logo ne peut pas être préparé pour le PDF.'));
    reader.readAsDataURL(blob);
  });
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
}

async function createBrandedDocument(title, subtitle, branding) {
  if (!branding?.logo || !branding?.brand) {
    throw new Error('Renseignez le nom du site et son logo dans Identité du site avant de créer un PDF.');
  }
  const logo = await fetchLogo(branding.logo);
  // jsPDF n'est chargé qu'au moment d'une exportation, pas à chaque visite du site.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ format: 'a4', unit: 'mm', compress: true });
  const maxWidth = 42;
  const maxHeight = 17;
  const ratio = logo.width / logo.height;
  const logoWidth = Math.min(maxWidth, maxHeight * ratio);
  const logoHeight = logoWidth / ratio;
  const logoType = /^data:image\/jpe?g/i.test(logo.dataUrl) ? 'JPEG' : 'PNG';
  doc.addImage(logo.dataUrl, logoType, PAGE.left, 12, logoWidth, logoHeight);

  doc.setTextColor(...COLORS.brown);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(branding.brand, PAGE.right, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const contactLines = [branding.city, branding.phone, branding.email].filter(Boolean);
  contactLines.forEach((line, index) => {
    doc.text(String(line), PAGE.right, 21 + index * 4, { align: 'right' });
  });

  doc.setDrawColor(...COLORS.gold);
  doc.setLineWidth(0.8);
  doc.line(PAGE.left, 35, PAGE.right, 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.brown);
  doc.text(title, PAGE.left, 47);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(subtitle, PAGE.left, 53);
  return doc;
}

function addSectionTitle(doc, title, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.brown);
  doc.text(title, PAGE.left, y);
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.25);
  doc.line(PAGE.left, y + 2, PAGE.right, y + 2);
  return y + 8;
}

function wrapped(doc, text, x, y, width, options = {}) {
  const { fontSize = 9, lineHeight = 4.5, maxLines } = options;
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(String(text || '—'), width);
  const printable = maxLines ? lines.slice(0, maxLines) : lines;
  doc.text(printable, x, y);
  return y + printable.length * lineHeight;
}

function addFooter(doc, label) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.25);
    doc.line(PAGE.left, 284, PAGE.right, 284);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(label, PAGE.left, 289);
    doc.text(`Page ${page} / ${pageCount}`, PAGE.right, 289, { align: 'right' });
  }
}

function safeFilename(value) {
  return String(value || 'document').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export function quotePdfFilename(quote, issueDate = quote.created_at || new Date().toISOString()) {
  return `devis-${safeFilename(quote.client_name || 'client')}-${safeFilename(String(issueDate).slice(0, 10))}-${safeFilename(quote.number)}.pdf`;
}

export async function createQuotePdf(quote, branding) {
  const quoteItems = normalizeQuoteItems(quote.items);
  const issueDate = quote.created_at || new Date().toISOString();
  const issueDateLabel = formatDate(issueDate);
  const statusLabels = {
    draft: 'Brouillon',
    sent: 'Envoyé',
    accepted: 'Accepté',
    refused: 'Refusé',
    expired: 'Expiré',
    cancelled: 'Annulé'
  };
  const total = quoteItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const doc = await createBrandedDocument(
    `DEVIS N° ${quote.number}`,
    `Émis le ${issueDateLabel} · Statut : ${statusLabels[quote.status] || 'Brouillon'}`,
    branding
  );
  let y = 68;
  y = addSectionTitle(doc, 'CLIENT', y);
  doc.setFillColor(...COLORS.light);
  const clientDetailCount = [quote.client_email, quote.client_phone, quote.service, quote.valid_until].filter(Boolean).length;
  doc.roundedRect(PAGE.left, y - 3, PAGE.right - PAGE.left, Math.max(19, 13 + 4.5 * (clientDetailCount + 1)), 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.brown);
  doc.text(quote.client_name || 'Client', PAGE.left + 4, y + 2);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  if (quote.client_email) { doc.text(quote.client_email, PAGE.left + 4, y); y += 4.5; }
  if (quote.client_phone) { doc.text(quote.client_phone, PAGE.left + 4, y); y += 4.5; }
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.brown);
  doc.text('Date du devis', 143, 73);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.muted);
  doc.text(issueDateLabel, PAGE.right - 4, 73, { align: 'right' });
  if (quote.service) { doc.text(`Prestation : ${quote.service}`, PAGE.left + 4, y); y += 4.5; }
  if (quote.valid_until) { doc.text(`Valable jusqu’au : ${formatDate(quote.valid_until)}`, PAGE.left + 4, y); y += 4.5; }
  y = Math.max(y + 7, 98);
  y = addSectionTitle(doc, 'DÉTAIL DES PRESTATIONS', y);

  const columns = [
    { label: 'Prestation', x: 16, width: 91, align: 'left' },
    { label: 'Qté', x: 111, width: 17, align: 'right' },
    { label: 'Prix unitaire', x: 132, width: 29, align: 'right' },
    { label: 'Total', x: 192, width: 28, align: 'right' }
  ];
  const tableHeader = () => {
    doc.setFillColor(...COLORS.light);
    doc.rect(PAGE.left, y - 5, PAGE.right - PAGE.left, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.brown);
    columns.forEach((column) => doc.text(column.label, column.x, y, { align: column.align }));
    y += 8;
  };
  tableHeader();

  for (const item of quoteItems) {
    const descriptionLines = doc.splitTextToSize(item.description, 89);
    const rowHeight = Math.max(7, descriptionLines.length * 4.3 + 2);
    if (y + rowHeight > 269) {
      doc.addPage();
      y = 22;
      tableHeader();
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.brown);
    doc.text(descriptionLines, columns[0].x, y);
    doc.text(String(item.quantity), columns[1].x, y, { align: 'right' });
    doc.text(money(item.unit_price), columns[2].x, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(money(item.quantity * item.unit_price), columns[3].x, y, { align: 'right' });
    y += rowHeight;
    doc.setDrawColor(...COLORS.line);
    doc.line(PAGE.left, y - 2, PAGE.right, y - 2);
  }

  if (y > 254) { doc.addPage(); y = 24; }
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(118, y + 2, 77, 19, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.brown);
  doc.text('TOTAL DU DEVIS', 123, y + 10);
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.gold);
  doc.text(money(total), 190, y + 15, { align: 'right' });
  y += 30;

  if (quote.notes) {
    if (y > 263) { doc.addPage(); y = 24; }
    y = addSectionTitle(doc, 'NOTES', y);
    y = wrapped(doc, quote.notes, PAGE.left, y, PAGE.right - PAGE.left, { fontSize: 9 }) + 6;
  }
  if (y > 253) { doc.addPage(); y = 32; }
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.35);
  doc.roundedRect(PAGE.left, y + 2, PAGE.right - PAGE.left, 28, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.brown);
  doc.text('BON POUR ACCORD', PAGE.left + 4, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text('Date et signature du client', PAGE.left + 4, y + 17);
  doc.line(PAGE.left + 95, y + 24, PAGE.right - 4, y + 24);
  if (y + 35 < 276) {
    doc.setFontSize(7);
    doc.text(
      quote.valid_until
        ? `Devis établi le ${issueDateLabel} · Valable jusqu’au ${formatDate(quote.valid_until)}`
        : `Devis établi le ${issueDateLabel}`,
      PAGE.left,
      y + 37
    );
  }
  addFooter(doc, `${branding.brand} · Devis ${quote.number} · ${quote.client_name || 'Client'}`);
  return {
    blob: doc.output('blob'),
    fileName: quotePdfFilename(quote, issueDate)
  };
}

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const shortMoney = (euros) => `${Math.round(euros).toLocaleString('fr-FR')} €`;

function drawMonthlyChart(doc, { x, y, width, height, income, expense, appointments }) {
  const series = [
    { label: 'Recettes', color: [46, 125, 50], values: income },
    { label: 'Dépenses', color: [198, 40, 40], values: expense },
    { label: 'CA rendez-vous', color: COLORS.gold, values: appointments }
  ];
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = 10 ** Math.floor(Math.log10(max));
  const niceMax = Math.ceil(max / step) * step;
  const left = x + 16;
  const plotW = width - 18;
  const top = y + 8;
  const plotH = height - 18;

  series.forEach((s, i) => {
    doc.setFillColor(...s.color);
    doc.rect(x + i * 38, y, 3, 3, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text(s.label, x + i * 38 + 5, y + 2.6);
  });
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i += 1) {
    const gy = top + plotH - (plotH * i) / 4;
    doc.line(left, gy, left + plotW, gy);
    doc.setFontSize(6);
    doc.text(shortMoney((niceMax * i) / 4), left - 2, gy + 1, { align: 'right' });
  }
  const groupW = plotW / 12;
  const barW = (groupW - 2) / series.length;
  MONTH_LABELS.forEach((label, m) => {
    const gx = left + m * groupW + 1;
    series.forEach((s, i) => {
      const h = (s.values[m] / niceMax) * plotH;
      if (h <= 0) return;
      doc.setFillColor(...s.color);
      doc.rect(gx + i * barW, top + plotH - h, barW - 0.3, h, 'F');
    });
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.muted);
    doc.text(label, left + m * groupW + groupW / 2, top + plotH + 5, { align: 'center' });
  });
}

function drawCategoryBars(doc, { x, y, width, rows, color }) {
  if (!rows.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text('Aucune donnée pour cette année.', x, y + 4);
    return;
  }
  const max = Math.max(...rows.map((r) => r.value));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const labelW = 32;
  const valueW = 30;
  const barMax = width - labelW - valueW;
  rows.forEach((row, i) => {
    const ry = y + i * 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.brown);
    doc.text(doc.splitTextToSize(row.label, labelW - 2)[0], x, ry + 3.5);
    doc.setFillColor(...COLORS.light);
    doc.rect(x + labelW, ry, barMax, 5, 'F');
    doc.setFillColor(...color);
    doc.rect(x + labelW, ry, Math.max(0.5, (row.value / max) * barMax), 5, 'F');
    doc.setTextColor(...COLORS.muted);
    doc.text(`${shortMoney(row.value)} · ${Math.round((row.value / total) * 100)} %`, x + width, ry + 3.5, { align: 'right' });
  });
}

export async function createAccountingPdf({ year, entries, summary, monthly, appointments, quotes, branding }) {
  const doc = await createBrandedDocument(
    'RAPPORT DE GESTION',
    `Exercice ${year} · Généré le ${formatDate(new Date().toISOString())}`,
    branding
  );
  let y = 65;
  y = addSectionTitle(doc, 'SYNTHÈSE DES ÉCRITURES', y);
  const cards = [
    ['Recettes TTC', summary.income.total],
    ['Dépenses TTC', summary.expense.total],
    ['Solde des écritures', summary.balance],
    ['TVA nette estimée', summary.vatBalance]
  ];
  const cardWidth = (PAGE.right - PAGE.left - 9) / 4;
  cards.forEach(([label, value], index) => {
    const x = PAGE.left + index * (cardWidth + 3);
    doc.setFillColor(...COLORS.light);
    doc.roundedRect(x, y, cardWidth, 21, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...COLORS.muted);
    doc.text(label, x + 3, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.brown);
    doc.text(money(value), x + 3, y + 14);
  });
  y += 30;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  y = wrapped(doc, `Rendez-vous : ${money(appointments.revenue)} facturés, ${money(appointments.collected)} encaissés, ${money(appointments.outstanding)} à encaisser. Devis acceptés : ${money(quotes.acceptedRevenue)}.`, PAGE.left, y, PAGE.right - PAGE.left, { fontSize: 8, lineHeight: 4 });
  y += 5;

  const income = Array(12).fill(0);
  const expense = Array(12).fill(0);
  const expenseByCategory = new Map();
  const incomeByCategory = new Map();
  for (const entry of entries) {
    const month = Number(String(entry.entry_date).slice(5, 7)) - 1;
    if (month < 0 || month > 11) continue;
    const euros = entry.amount / 100;
    const key = entry.category || 'Autres';
    if (entry.type === 'income') {
      income[month] += euros;
      incomeByCategory.set(key, (incomeByCategory.get(key) || 0) + euros);
    } else {
      expense[month] += euros;
      expenseByCategory.set(key, (expenseByCategory.get(key) || 0) + euros);
    }
  }
  const appointmentRevenue = MONTH_LABELS.map((_, index) => (monthly[index]?.revenue || 0) / 100);
  const topRows = (map) => [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5);

  y = addSectionTitle(doc, 'ÉVOLUTION MENSUELLE', y);
  drawMonthlyChart(doc, { x: PAGE.left, y, width: PAGE.right - PAGE.left, height: 62, income, expense, appointments: appointmentRevenue });
  y += 70;

  y = addSectionTitle(doc, 'RÉPARTITION PAR CATÉGORIE', y);
  const half = (PAGE.right - PAGE.left - 10) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.brown);
  doc.text('Recettes', PAGE.left, y);
  doc.text('Dépenses', PAGE.left + half + 10, y);
  drawCategoryBars(doc, { x: PAGE.left, y: y + 3, width: half, rows: topRows(incomeByCategory), color: [46, 125, 50] });
  drawCategoryBars(doc, { x: PAGE.left + half + 10, y: y + 3, width: half, rows: topRows(expenseByCategory), color: [198, 40, 40] });

  doc.addPage();
  y = 22;
  y = addSectionTitle(doc, 'ACTIVITÉ MENSUELLE DES RENDEZ-VOUS', y);
  const monthColumns = [
    { label: 'Mois', x: 16, align: 'left' },
    { label: 'CA facturé', x: 115, align: 'right' },
    { label: 'Encaissé', x: 155, align: 'right' },
    { label: 'Rendez-vous', x: 192, align: 'right' }
  ];
  doc.setFillColor(...COLORS.light);
  doc.rect(PAGE.left, y - 5, PAGE.right - PAGE.left, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.brown);
  monthColumns.forEach(({ label, x, align }) => doc.text(label, x, y, { align }));
  y += 6;
  for (const row of monthly) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.brown);
    doc.text(row.month, monthColumns[0].x, y);
    doc.text(money(row.revenue), monthColumns[1].x, y, { align: 'right' });
    doc.text(money(row.collected), monthColumns[2].x, y, { align: 'right' });
    doc.text(String(row.count), monthColumns[3].x, y, { align: 'right' });
    y += 5;
  }
  y += 4;
  y = addSectionTitle(doc, 'JOURNAL DES RECETTES ET DÉPENSES', y);

  const ledgerColumns = [
    { label: 'Date', x: 16, width: 19, align: 'left' },
    { label: 'Type', x: 35, width: 15, align: 'left' },
    { label: 'Détail / tiers / note', x: 52, width: 49, align: 'left' },
    { label: 'Catégorie', x: 104, width: 25, align: 'left' },
    { label: 'Règlement', x: 131, width: 21, align: 'left' },
    { label: 'TTC', x: 177, width: 23, align: 'right' },
    { label: 'TVA %', x: 185, width: 12, align: 'right' },
    { label: 'TVA*', x: 194, width: 15, align: 'right' }
  ];
  const drawLedgerHeader = () => {
    doc.setFillColor(...COLORS.light);
    doc.rect(PAGE.left, y - 5, PAGE.right - PAGE.left, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...COLORS.brown);
    ledgerColumns.forEach(({ label, x, align }) => doc.text(label, x, y, { align }));
    y += 6;
  };
  drawLedgerHeader();
  if (entries.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text('Aucune recette ou dépense saisie pour cette période.', PAGE.left, y + 3);
    y += 9;
  }
  for (const entry of entries) {
    const details = [
      entry.description,
      entry.counterparty ? `Client / fournisseur : ${entry.counterparty}` : '',
      entry.notes ? `Note : ${entry.notes}` : ''
    ].filter(Boolean).join('\n');
    const detailLines = doc.splitTextToSize(details, ledgerColumns[2].width);
    const categoryLines = doc.splitTextToSize(entry.category, ledgerColumns[3].width);
    const rowHeight = Math.max(5, Math.max(detailLines.length, categoryLines.length) * 3.5);
    if (y + rowHeight > 275) {
      doc.addPage();
      y = 20;
      drawLedgerHeader();
    }
    const vat = receiptVat(entry);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...COLORS.brown);
    doc.text(formatDate(entry.entry_date), ledgerColumns[0].x, y);
    doc.text(entry.type === 'income' ? 'Recette' : 'Dépense', ledgerColumns[1].x, y);
    doc.text(detailLines, ledgerColumns[2].x, y);
    doc.text(categoryLines, ledgerColumns[3].x, y);
    doc.text(formatDate(entry.payment_date), ledgerColumns[4].x, y);
    doc.text(money(entry.type === 'expense' ? -entry.amount : entry.amount), ledgerColumns[5].x, y, { align: 'right' });
    doc.text(`${String(entry.vat_rate).replace('.', ',')} %`, ledgerColumns[6].x, y, { align: 'right' });
    doc.text(money(vat), ledgerColumns[7].x, y, { align: 'right' });
    y += rowHeight;
    doc.setDrawColor(...COLORS.line);
    doc.line(PAGE.left, y - 1, PAGE.right, y - 1);
  }
  y += 6;
  if (y > 273) { doc.addPage(); y = 22; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.muted);
  wrapped(doc, '* TVA indicative calculée à partir des taux renseignés. Ce rapport de gestion ne constitue pas une déclaration fiscale ni une comptabilité certifiée.', PAGE.left, y, PAGE.right - PAGE.left, { fontSize: 7, lineHeight: 3.7 });
  addFooter(doc, `${branding.brand} · Rapport comptable de gestion ${year}`);
  return { blob: doc.output('blob'), fileName: `comptabilite-${year}.pdf` };
}
