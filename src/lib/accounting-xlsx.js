// Export Excel (.xlsx) mis en forme du journal comptable. ExcelJS est chargé à la demande.
const EURO = '#,##0.00 "€";[Red]-#,##0.00 "€"';
const INK = 'FF1F1F1F';
const GOLD = 'FFC9A24D';
const SOFT = 'FFF5F1E8';
const BORDER = { style: 'thin', color: { argb: 'FFD9D2C0' } };

const cents = (value) => Number(((value || 0) / 100).toFixed(2));
const toDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
};

function splitVat(entry) {
  const ht = entry.vat_rate > 0 ? Math.round(entry.amount * 100 / (100 + entry.vat_rate)) : entry.amount;
  return { ht, vat: entry.amount - ht };
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const PALETTE = ['#C9A24D', '#1F1F1F', '#2E7D32', '#C62828', '#1565C0', '#8E24AA', '#EF6C00', '#00838F'];
const eur = (value) => `${Math.round(value).toLocaleString('fr-FR')} €`;

function makeCanvas(width, height) {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

function drawBarChart(title, series) {
  const width = 900;
  const height = 380;
  const { canvas, ctx } = makeCanvas(width, height);
  const left = 70;
  const right = 20;
  const top = 60;
  const bottom = 45;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = 10 ** Math.floor(Math.log10(max));
  const niceMax = Math.ceil(max / step) * step;

  ctx.fillStyle = '#1F1F1F';
  ctx.font = 'bold 18px Arial';
  ctx.fillText(title, left, 28);
  series.forEach((s, i) => {
    ctx.fillStyle = s.color;
    ctx.fillRect(left + i * 130, 40, 12, 12);
    ctx.fillStyle = '#444';
    ctx.font = '12px Arial';
    ctx.fillText(s.label, left + i * 130 + 18, 51);
  });

  ctx.strokeStyle = '#E5E0D2';
  ctx.fillStyle = '#666';
  ctx.font = '11px Arial';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i += 1) {
    const y = top + plotH - (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
    ctx.fillText(eur((niceMax * i) / 4), left - 8, y + 4);
  }
  ctx.textAlign = 'center';
  const groupW = plotW / 12;
  const barW = Math.min(18, (groupW - 8) / series.length);
  MONTHS.forEach((month, m) => {
    const x0 = left + m * groupW + (groupW - barW * series.length) / 2;
    series.forEach((s, i) => {
      const h = (s.values[m] / niceMax) * plotH;
      ctx.fillStyle = s.color;
      ctx.fillRect(x0 + i * barW, top + plotH - h, barW - 2, h);
    });
    ctx.fillStyle = '#444';
    ctx.fillText(month, left + m * groupW + groupW / 2, height - 20);
  });
  return canvas.toDataURL('image/png');
}

function drawDonut(title, slices) {
  const width = 900;
  const height = 380;
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = '#1F1F1F';
  ctx.font = 'bold 18px Arial';
  ctx.fillText(title, 20, 28);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (!total) {
    ctx.fillStyle = '#888';
    ctx.font = '14px Arial';
    ctx.fillText('Aucune donnée pour cette année.', 20, 80);
    return canvas.toDataURL('image/png');
  }
  const cx = 200;
  const cy = 210;
  const radius = 130;
  let angle = -Math.PI / 2;
  slices.forEach((slice, i) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fill();
    angle += sweep;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.fillStyle = '#1F1F1F';
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(eur(total), cx, cy + 6);
  ctx.textAlign = 'left';
  ctx.font = '13px Arial';
  slices.slice(0, 10).forEach((slice, i) => {
    const y = 80 + i * 28;
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fillRect(420, y - 11, 14, 14);
    ctx.fillStyle = '#333';
    ctx.fillText(`${slice.label} — ${eur(slice.value)} (${Math.round((slice.value / total) * 100)} %)`, 442, y);
  });
  return canvas.toDataURL('image/png');
}

export async function downloadAccountingXlsx({ year, entries, monthly, appointments, quotes, ledger, branding }) {
  const excel = await import('exceljs');
  const Workbook = excel.Workbook || excel.default?.Workbook;
  const company = branding?.brand || branding?.name || 'Tom Photo';
  const workbook = new Workbook();
  workbook.creator = company;
  workbook.created = new Date();

  const sorted = [...entries].sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)));

  // --- Feuille 1 : tableau de bord (une seule page) ---
  const summary = workbook.addWorksheet('Tableau de bord', { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 18 }];
  summary.mergeCells('A1:F1');
  Object.assign(summary.getCell('A1'), { value: `${company} — Comptabilité ${year}` });
  summary.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
  summary.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  summary.getRow(1).height = 36;
  summary.mergeCells('A2:F2');
  summary.getCell('A2').value = `Édité le ${new Date().toLocaleDateString('fr-FR')} · TVA estimée à partir des taux saisis, hors déclaration fiscale.`;
  summary.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF666666' } };

  const section = (title) => {
    const row = summary.addRow([title]);
    summary.mergeCells(`A${row.number}:F${row.number}`);
    row.font = { bold: true, color: { argb: INK } };
    row.height = 22;
    row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } }; });
  };
  const line = (label, value, note = '') => {
    const row = summary.addRow([label, '', '', value, note]);
    summary.mergeCells(`A${row.number}:C${row.number}`);
    summary.mergeCells(`E${row.number}:F${row.number}`);
    row.getCell(4).numFmt = EURO;
    row.getCell(5).font = { color: { argb: 'FF666666' }, size: 10 };
    for (let col = 1; col <= 6; col += 1) row.getCell(col).border = { bottom: BORDER };
    return row;
  };
  summary.addRow([]);
  section('Registre');
  line('Recettes TTC', cents(ledger.income.total));
  line('Dépenses TTC', cents(ledger.expense.total));
  line('Résultat', cents(ledger.balance)).font = { bold: true };
  line('TVA estimée à reverser', cents(ledger.vatBalance), 'TVA recettes − TVA dépenses');
  summary.addRow([]);
  section('Rendez-vous et devis');
  line('CA facturé (rendez-vous)', cents(appointments.revenue), `${appointments.total || 0} rendez-vous`);
  line('Encaissé', cents(appointments.collected));
  line('Reste à encaisser', cents(appointments.outstanding));
  line('Devis acceptés', cents(quotes.acceptedRevenue), `${quotes.accepted || 0} devis signés`);
  summary.addRow([]);
  section('Évolution mensuelle');

  // --- Feuille : graphiques ---
  const income = Array(12).fill(0);
  const expense = Array(12).fill(0);
  const byCategory = new Map();
  sorted.forEach((entry) => {
    const month = Number(String(entry.entry_date).slice(5, 7)) - 1;
    if (month < 0 || month > 11) return;
    if (entry.type === 'income') income[month] += entry.amount / 100;
    else {
      expense[month] += entry.amount / 100;
      const key = entry.category || 'Autres';
      byCategory.set(key, (byCategory.get(key) || 0) + entry.amount / 100);
    }
  });
  const appointmentRevenue = Array(12).fill(0);
  monthly.forEach((row, index) => { appointmentRevenue[index] = (row.revenue || 0) / 100; });

  const charts = summary;
  const chartHead = charts.addRow(['Mois', 'Recettes', 'Dépenses', 'Résultat', 'CA rendez-vous', 'Cumul résultat']);
  chartHead.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.alignment = { horizontal: 'center' };
  });
  const firstMonthRow = chartHead.number + 1;
  MONTHS.forEach((month, index) => {
    const r = firstMonthRow + index;
    const row = charts.addRow([month, income[index], expense[index], { formula: `B${r}-C${r}` }, appointmentRevenue[index],
      { formula: index === 0 ? `D${r}` : `F${r - 1}+D${r}` }]);
    for (let col = 2; col <= 6; col += 1) {
      row.getCell(col).numFmt = EURO;
      row.getCell(col).border = { bottom: BORDER };
    }
    row.getCell(1).border = { bottom: BORDER };
  });
  const lastMonthRow = firstMonthRow + 11;
  const sumCol = (col) => ({ formula: `SUM(${col}${firstMonthRow}:${col}${lastMonthRow})` });
  const totals = charts.addRow(['Total', sumCol('B'), sumCol('C'), sumCol('D'), sumCol('E')]);
  totals.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    if (col > 1) cell.numFmt = EURO;
  });
  charts.addRow([]);
  const chartsRow = charts.addRow(['Graphiques']);
  charts.mergeCells(`A${chartsRow.number}:F${chartsRow.number}`);
  chartsRow.height = 22;
  chartsRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: INK } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
  });

  const PIC_W = 690;
  const PIC_H = 291;
  const ROWS_PER_PIC = 16;
  const addPicture = (dataUrl, offset) => {
    const id = workbook.addImage({ base64: dataUrl, extension: 'png' });
    charts.addImage(id, { tl: { col: 0, row: chartsRow.number + offset * ROWS_PER_PIC }, ext: { width: PIC_W, height: PIC_H } });
  };
  addPicture(drawBarChart(`Recettes et dépenses par mois — ${year}`, [
    { label: 'Recettes', color: '#2E7D32', values: income },
    { label: 'Dépenses', color: '#C62828', values: expense },
    { label: 'CA rendez-vous', color: '#C9A24D', values: appointmentRevenue }
  ]), 0);
  addPicture(drawDonut(
    'Répartition des dépenses par catégorie',
    [...byCategory.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  ), 1);
  for (let i = 0; i < ROWS_PER_PIC * 2; i += 1) charts.addRow([]);
  summary.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9, horizontalCentered: true };

  // --- Feuille 2 : journal ---
  const journal = workbook.addWorksheet('Journal', { views: [{ state: 'frozen', ySplit: 1 }] });
  journal.columns = [
    { header: 'Date', key: 'date', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Type', key: 'type', width: 11 },
    { header: 'Libellé', key: 'label', width: 34 },
    { header: 'Catégorie', key: 'category', width: 20 },
    { header: 'Client / fournisseur', key: 'party', width: 24 },
    { header: 'Montant HT', key: 'ht', width: 14, style: { numFmt: EURO } },
    { header: 'TVA', key: 'vat', width: 12, style: { numFmt: EURO } },
    { header: 'Montant TTC', key: 'ttc', width: 14, style: { numFmt: EURO } },
    { header: 'Taux TVA', key: 'rate', width: 10, style: { numFmt: '0.0"%"' } },
    { header: 'Statut', key: 'status', width: 11 },
    { header: 'Règlement', key: 'paid', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Justificatif', key: 'receipt', width: 26 },
    { header: 'Notes', key: 'notes', width: 30 }
  ];
  const head = journal.getRow(1);
  head.height = 24;
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  sorted.forEach((entry, index) => {
    const { ht, vat } = splitVat(entry);
    const sign = entry.type === 'income' ? 1 : -1;
    const row = journal.addRow({
      date: toDate(entry.entry_date),
      type: entry.type === 'income' ? 'Recette' : 'Dépense',
      label: entry.description,
      category: entry.category,
      party: entry.counterparty,
      ht: cents(ht * sign),
      vat: cents(vat * sign),
      ttc: cents(entry.amount * sign),
      rate: entry.vat_rate || 0,
      status: entry.payment_date ? 'Réglé' : 'À régler',
      paid: toDate(entry.payment_date),
      receipt: entry.receipt_url,
      notes: entry.notes
    });
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { bottom: BORDER };
      if (index % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
    });
    row.getCell('type').font = { color: { argb: entry.type === 'income' ? 'FF2E7D32' : 'FFC62828' }, bold: true };
  });

  const first = 2;
  const last = journal.rowCount;
  const total = journal.addRow({
    label: 'RÉSULTAT',
    ht: last >= first ? { formula: `SUM(F${first}:F${last})` } : 0,
    vat: last >= first ? { formula: `SUM(G${first}:G${last})` } : 0,
    ttc: last >= first ? { formula: `SUM(H${first}:H${last})` } : 0
  });
  total.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > 13) return;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    cell.border = { top: { style: 'medium', color: { argb: INK } } };
  });
  if (last >= first) journal.autoFilter = { from: 'A1', to: `M${last}` };

  [journal].forEach((sheet) => {
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `comptabilite-${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
