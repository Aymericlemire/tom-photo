// Module de comptabilité de gestion : rendez-vous, devis et registre manuel.
// Important : les indicateurs de TVA sont estimatifs, pas une déclaration fiscale.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, formatDateForInput } from '../api.js';
import PdfPreviewModal from './PdfPreviewModal.jsx';
import { createAccountingPdf } from '../lib/pdf-export.js';
import { downloadAccountingXlsx } from '../lib/accounting-xlsx.js';

const euro = (cents = 0) => `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const blankEntry = () => ({
  type: 'income', description: '', category: 'Prestation photo', counterparty: '',
  amount: '', vat_rate: 0, entry_date: formatDateForInput(), payment_date: '',
  receipt_url: '', notes: ''
});


export default function AccountingManager({ onError, branding }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [typeFilter, setTypeFilter] = useState('all');
  const [data, setData] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [entryForm, setEntryForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [creatingPdf, setCreatingPdf] = useState(false);

  const load = useCallback(async (targetYear) => {
    setLoading(true);
    setLoadError('');
    try {
      const [summary, ledger] = await Promise.all([
        api(`/api/admin/accounting?year=${targetYear}`),
        api(`/api/admin/accounting/entries?year=${targetYear}`)
      ]);
      setData(summary);
      setEntries(ledger.entries);
      onError('');
    } catch (error) {
      setLoadError(error.message);
      onError(error.message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { load(year); }, [year, load]);

  const saveEntry = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const amountInCents = Math.round(Number(entryForm.amount) * 100);
      const payload = { ...entryForm, amount: amountInCents, vat_rate: Number(entryForm.vat_rate) };
      const url = editingId
        ? `/api/admin/accounting/entries/${editingId}`
        : '/api/admin/accounting/entries';
      await api(url, { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      setEntryForm(null);
      setEditingId(null);
      await load(year);
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const attachReceipt = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const kind = file.type === 'application/pdf' ? 'document' : 'image';
    if (kind === 'image' && !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) {
      onError('Choisissez un justificatif PDF, JPEG, PNG, WebP, GIF ou AVIF.');
      event.target.value = '';
      return;
    }
    const formData = new FormData();
    formData.append('kind', kind);
    formData.append('file', file);
    try {
      const uploaded = await api('/api/admin/accounting/receipts', { method: 'POST', body: formData, timeoutMs: 180000 });
      setEntryForm((current) => ({ ...current, receipt_url: uploaded.url }));
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      event.target.value = '';
    }
  };

  const editEntry = (entry) => {
    setEditingId(entry.id);
    setEntryForm({ ...entry, amount: (entry.amount / 100).toFixed(2), vat_rate: entry.vat_rate });
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Supprimer l’écriture « ${entry.description} » ? Cette action est définitive.`)) return;
    try {
      await api(`/api/admin/accounting/entries/${entry.id}`, { method: 'DELETE' });
      await load(year);
    } catch (error) {
      onError(error.message);
    }
  };

  const exportPdf = async () => {
    setCreatingPdf(true);
    try {
      setPdfPreview(await createAccountingPdf({
        year,
        entries,
        summary: ledger,
        monthly: data.monthly,
        appointments,
        quotes,
        branding
      }));
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setCreatingPdf(false);
    }
  };

  const visibleEntries = useMemo(
    () => entries.filter((entry) => typeFilter === 'all' || entry.type === typeFilter),
    [entries, typeFilter]
  );
  const maxMonthlyRevenue = data ? Math.max(1, ...data.monthly.map((row) => row.revenue)) : 1;
  const appointments = data?.appointments || { revenue: 0, collected: 0, outstanding: 0, total: 0 };
  const quotes = data?.quotes || { accepted: 0, sent: 0, draft: 0, acceptedRevenue: 0 };
  const ledger = data?.ledger || { income: { total: 0, vat: 0 }, expense: { total: 0, vat: 0 }, balance: 0, vatBalance: 0 };

  return (
    <section className="accounting" aria-labelledby="accounting-heading">
      <header className="accounting__header">
        <div>
          <span className="admin-section-kicker">MODULE COMPTABILITÉ</span>
          <h2 id="accounting-heading">Comptabilité</h2>
          <p>Rassemblez recettes, dépenses, rendez-vous, devis et justificatifs.</p>
        </div>
        <div className="accounting__year">
          <label>Année
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {[0, 1, 2, 3, 4].map((offset) => {
                const optionYear = new Date().getFullYear() - offset;
                return <option key={optionYear} value={optionYear}>{optionYear}</option>;
              })}
            </select>
          </label>
          <button type="button" className="btn btn--outline btn--small" disabled={!data || creatingPdf} onClick={exportPdf}>
            {creatingPdf ? 'Préparation…' : 'Aperçu PDF'}
          </button>
          <button type="button" className="btn btn--outline btn--small" disabled={!data} onClick={() => downloadAccountingXlsx({ year, entries, monthly: data.monthly, appointments, quotes, ledger, branding }).catch((error) => onError(error.message))}>
            ↓ Exporter Excel
          </button>
        </div>
      </header>

      {!data ? (loading
        ? <p className="accounting__empty">Chargement de la comptabilité…</p>
        : (
          <div className="accounting__empty" role="alert">
            <p>{loadError || 'La comptabilité ne peut pas être chargée.'}</p>
            <button type="button" className="btn btn--outline btn--small" onClick={() => load(year)}>Réessayer</button>
          </div>
        )) : (
        <>
          <section className="accounting__stats" aria-label="Indicateurs clés">
            <article className="accounting__card accounting__card--revenue"><span>Recettes saisies TTC</span><strong>{euro(ledger.income.total)}</strong><small>{ledger.income.count} écritures</small></article>
            <article className="accounting__card accounting__card--outstanding"><span>Dépenses saisies TTC</span><strong>{euro(ledger.expense.total)}</strong><small>{ledger.expense.count} écritures</small></article>
            <article className="accounting__card accounting__card--collected"><span>Solde des écritures</span><strong>{euro(ledger.balance)}</strong><small>recettes moins dépenses</small></article>
            <article className="accounting__card accounting__card--quotes"><span>TVA estimée à reverser</span><strong>{euro(ledger.vatBalance)}</strong><small>TVA recettes moins TVA dépenses</small></article>
          </section>
          <p className="accounting__notice">Suivi de gestion uniquement : les montants de TVA sont des estimations et ne remplacent pas une comptabilité ou déclaration certifiée.</p>

          <section className="accounting__block" aria-label="Écritures comptables">
            <div className="accounting__ledger-heading">
              <div><h3>Recettes et dépenses</h3><p>Chaque montant est TTC. Ajoutez un justificatif PDF ou image si vous en avez un.</p></div>
              <button type="button" className="btn btn--primary btn--small" onClick={() => { setEditingId(null); setEntryForm(blankEntry()); }}>+ Nouvelle écriture</button>
            </div>
            {entryForm && (
              <form className="accounting__form" onSubmit={saveEntry}>
                <h4>{editingId ? 'Modifier une écriture' : 'Ajouter une recette ou une dépense'}</h4>
                <div className="accounting__form-grid">
                  <label>Type<select required value={entryForm.type} onChange={(event) => setEntryForm({ ...entryForm, type: event.target.value, category: event.target.value === 'income' ? 'Prestation photo' : 'Frais de déplacement' })}><option value="income">Recette</option><option value="expense">Dépense</option></select></label>
                  <label>Description<input required maxLength="240" value={entryForm.description} onChange={(event) => setEntryForm({ ...entryForm, description: event.target.value })} placeholder="Ex. Séance photo mariage" /></label>
                  <label>Catégorie<input required maxLength="80" value={entryForm.category} onChange={(event) => setEntryForm({ ...entryForm, category: event.target.value })} placeholder="Ex. Matériel" /></label>
                  <label>Client / fournisseur<input maxLength="160" value={entryForm.counterparty} onChange={(event) => setEntryForm({ ...entryForm, counterparty: event.target.value })} placeholder="Nom (facultatif)" /></label>
                  <label>Montant TTC (€)<input required type="number" min="0" step="0.01" value={entryForm.amount} onChange={(event) => setEntryForm({ ...entryForm, amount: event.target.value })} /></label>
                  <label>Taux de TVA<select value={entryForm.vat_rate} onChange={(event) => setEntryForm({ ...entryForm, vat_rate: event.target.value })}><option value="0">0 %</option><option value="5.5">5,5 %</option><option value="10">10 %</option><option value="20">20 %</option></select></label>
                  <label>Date de l’opération<input required type="date" value={entryForm.entry_date} onChange={(event) => setEntryForm({ ...entryForm, entry_date: event.target.value })} /></label>
                  <label>Date de règlement<input type="date" value={entryForm.payment_date} onChange={(event) => setEntryForm({ ...entryForm, payment_date: event.target.value })} /></label>
                  <label className="accounting__form-wide">Justificatif (PDF ou image)<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={attachReceipt} />{entryForm.receipt_url && <a href={entryForm.receipt_url} target="_blank" rel="noreferrer">Ouvrir le justificatif actuel</a>}</label>
                  <label className="accounting__form-wide">Notes<textarea rows="2" maxLength="2000" value={entryForm.notes} onChange={(event) => setEntryForm({ ...entryForm, notes: event.target.value })} /></label>
                </div>
                <div className="accounting__form-actions"><button type="button" className="btn btn--outline btn--small" onClick={() => { setEntryForm(null); setEditingId(null); }}>Annuler</button><button type="submit" className="btn btn--primary btn--small" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>
              </form>
            )}
            <div className="accounting__ledger-toolbar">
              <p>{visibleEntries.length} écriture{visibleEntries.length > 1 ? 's' : ''} affichée{visibleEntries.length > 1 ? 's' : ''} en {year}</p>
              <label>Afficher<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Tout</option><option value="income">Recettes</option><option value="expense">Dépenses</option></select></label>
            </div>
            {visibleEntries.length === 0 ? <p className="accounting__empty">Aucune écriture pour ce filtre. Ajoutez vos premières recettes et dépenses.</p> : (
              <div className="accounting__table-wrap">
                <table className="accounting__table">
                  <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Catégorie</th><th>Règlement</th><th>Montant TTC</th><th>Justificatif</th><th>Actions</th></tr></thead>
                  <tbody>{visibleEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString('fr-FR')}</td>
                      <td><span className={`accounting__type accounting__type--${entry.type}`}>{entry.type === 'income' ? 'Recette' : 'Dépense'}</span></td>
                      <td>{entry.description}{entry.counterparty && <small className="accounting__counterparty">{entry.counterparty}</small>}</td>
                      <td>{entry.category}</td>
                      <td>{entry.payment_date ? new Date(`${entry.payment_date}T12:00:00`).toLocaleDateString('fr-FR') : 'À régler'}</td>
                      <td className={entry.type === 'income' ? 'accounting__amount-income' : 'accounting__amount-expense'}>{entry.type === 'expense' ? '−' : '+'}{euro(entry.amount)}</td>
                      <td>{entry.receipt_url ? <a href={entry.receipt_url} target="_blank" rel="noreferrer">Ouvrir</a> : '—'}</td>
                      <td><div className="accounting__actions"><button type="button" onClick={() => editEntry(entry)}>Modifier</button><button type="button" onClick={() => deleteEntry(entry)}>Supprimer</button></div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {pdfPreview && <PdfPreviewModal file={pdfPreview} onClose={() => setPdfPreview(null)} />}
          </section>

          <section className="accounting__stats accounting__stats--legacy" aria-label="Rendez-vous et devis">
            <article className="accounting__card accounting__card--revenue"><span>CA des rendez-vous</span><strong>{euro(appointments.revenue)}</strong><small>{appointments.total} rendez-vous sur l’année</small></article>
            <article className="accounting__card accounting__card--collected"><span>Encaissé sur les rendez-vous</span><strong>{euro(appointments.collected)}</strong><small>marqués payés</small></article>
            <article className="accounting__card accounting__card--outstanding"><span>Reste à encaisser</span><strong>{euro(appointments.outstanding)}</strong><small>rendez-vous facturés</small></article>
            <article className="accounting__card accounting__card--quotes"><span>Devis acceptés</span><strong>{euro(quotes.acceptedRevenue)}</strong><small>{quotes.accepted || 0} devis signés · {(quotes.sent || 0) + (quotes.draft || 0)} en attente</small></article>
          </section>

          <section className="accounting__block" aria-label="Chiffre d'affaires mensuel">
            <h3>Chiffre d’affaires des rendez-vous par mois</h3>
            <div className="accounting__chart">{data.monthly.map((row) => {
              const height = Math.round((row.revenue / maxMonthlyRevenue) * 100);
              const collectedHeight = row.revenue > 0 ? Math.round((row.collected / row.revenue) * 100) : 0;
              return <div className="accounting__bar-col" key={row.month} title={`${euro(row.revenue)} facturé · ${euro(row.collected)} encaissé`}><div className="accounting__bar-stack"><div className="accounting__bar accounting__bar--collected" style={{ height: `${collectedHeight}%` }} /><div className="accounting__bar accounting__bar--revenue" style={{ height: `${height}%` }} /></div><span className="accounting__bar-label">{MONTH_LABELS[Number(row.month.slice(5, 7)) - 1]}</span></div>;
            })}</div>
            <div className="accounting__legend"><span><i className="accounting__legend-revenue" /> CA facturé</span><span><i className="accounting__legend-collected" /> Encaissé</span></div>
          </section>
        </>
      )}
    </section>
  );
}
