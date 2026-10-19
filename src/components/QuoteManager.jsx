// QuoteManager.jsx — GESTION DES DEVIS côté admin (module commercial)
// -----------------------------------------------------------------------------
// Permet à Tom de créer des devis chiffrés (client + lignes de prestation),
// de les envoyer par e-mail au client, et de suivre leur statut de suivi
// (brouillon → envoyé → accepté / refusé…). Le chiffre d'affaires potentiel
// (devis acceptés) est affiché en haut.
//
// Les montants sont saisis en EUROS puis convertis en centimes pour l'API.
// Ce composant est autonome : il recharge ses données à chaque changement.
// -----------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import PdfPreviewModal from './PdfPreviewModal.jsx';
import { createQuotePdf } from '../lib/pdf-export.js';
import { normalizeQuoteItems } from '../lib/quote-format.js';

const statuses = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  refused: 'Refusé',
  expired: 'Expiré',
  cancelled: 'Annulé'
};

const statusClass = {
  draft: 'is-draft',
  sent: 'is-sent',
  accepted: 'is-accepted',
  refused: 'is-refused',
  expired: 'is-expired',
  cancelled: 'is-cancelled'
};

const euro = (cents) => `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const getQuoteItems = (quote) => {
  try {
    return normalizeQuoteItems(quote.items);
  } catch {
    return [];
  }
};

function emptyForm() {
  return {
    client_name: '',
    client_email: '',
    client_phone: '',
    service: '',
    valid_until: '',
    notes: '',
    items: [{ description: '', quantity: 1, unit_price: 0 }]
  };
}

// Calcule le total (centimes) d'une liste de lignes saisies en euros.
const computeTotalCents = (items) => Math.round(
  items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0)
);

export default function QuoteManager({ onError, branding }) {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total: 0, draft: 0, sent: 0, accepted: 0, refused: 0, expired: 0, cancelled: 0, acceptedRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // null = liste | 'create' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/admin/quotes');
      setItems(data.items || []);
      setStats(data.stats || { total: 0, draft: 0, sent: 0, accepted: 0, refused: 0, expired: 0, cancelled: 0, acceptedRevenue: 0 });
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const [contacts, setContacts] = useState([]);
  useEffect(() => {
    api('/api/admin/crm').then((data) => setContacts(data.items || [])).catch(() => setContacts([]));
  }, []);

  // Clients connus : contacts CRM + clients déjà présents dans des devis, sans doublon d'e-mail.
  const knownClients = useMemo(() => {
    const byKey = new Map();
    const add = (name, email, phone) => {
      if (!name) return;
      const key = (email || name).trim().toLowerCase();
      if (!byKey.has(key)) byKey.set(key, { name, email: email || '', phone: phone || '' });
    };
    contacts.forEach((c) => add(c.name, c.email, c.phone));
    items.forEach((q) => add(q.client_name, q.client_email, q.client_phone));
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [contacts, items]);

  function pickClient(name) {
    setForm((current) => ({ ...current, client_name: name }));
    const match = knownClients.find((c) => c.name === name);
    if (match) {
      setForm((current) => ({
        ...current,
        client_name: match.name,
        client_email: match.email || current.client_email,
        client_phone: match.phone || current.client_phone
      }));
    }
  }

  const totalCents = useMemo(() => computeTotalCents(form.items), [form.items]);

  function startCreate() {
    setForm(emptyForm());
    setMode('create');
    setEditingId(null);
  }

  function startEdit(quote) {
    let quoteItems;
    try {
      quoteItems = normalizeQuoteItems(quote.items);
    } catch (error) {
      onError(`${error.message} (${quote.number})`);
      return;
    }
    setForm({
      client_name: quote.client_name,
      client_email: quote.client_email,
      client_phone: quote.client_phone || '',
      service: quote.service || '',
      valid_until: quote.valid_until || '',
      notes: quote.notes || '',
      items: quoteItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price / 100 // centimes → euros pour l'édition
      }))
    });
    setMode('edit');
    setEditingId(quote.id);
  }

  function cancelForm() {
    setMode(null);
    setEditingId(null);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateItem(index, field, value) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)
    }));
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, { description: '', quantity: 1, unit_price: 0 }] }));
  }

  function removeItem(index) {
    setForm((current) => ({ ...current, items: current.items.length > 1 ? current.items.filter((_, i) => i !== index) : current.items }));
  }

  // Construit le payload envoyé à l'API (prix en centimes, nombres forcés).
  function buildPayload() {
    return {
      client_name: form.client_name.trim(),
      client_email: form.client_email.trim(),
      client_phone: form.client_phone.trim(),
      service: form.service.trim(),
      valid_until: form.valid_until || '',
      notes: form.notes.trim(),
      items: form.items
        .filter((item) => item.description.trim())
        .map((item) => ({
          description: item.description.trim(),
          quantity: Math.round(Number(item.quantity) || 1),
          unit_price: Math.round((Number(item.unit_price) || 0) * 100)
        }))
    };
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const payload = buildPayload();
    if (!payload.items.length) {
      onError('Ajoutez au moins une ligne avec une description.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'edit') {
        await api(`/api/admin/quotes/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/api/admin/quotes', { method: 'POST', body: JSON.stringify(payload) });
      }
      setMode(null);
      setEditingId(null);
      await load();
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function send(quote) {
    if (busy) return;
    if (!window.confirm(`Envoyer le devis ${quote.number} à ${quote.client_email} ?`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/quotes/${quote.id}/send`, { method: 'POST' });
      await load();
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id, status) {
    setBusy(true);
    try {
      await api(`/api/admin/quotes/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item));
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(quote) {
    if (!window.confirm(`Supprimer définitivement le devis ${quote.number} ?`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/quotes/${quote.id}`, { method: 'DELETE' });
      await load();
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function previewPdf(quote) {
    setCreatingPdf(true);
    try {
      setPdfPreview(await createQuotePdf(quote, branding));
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setCreatingPdf(false);
    }
  }

  async function previewFormPdf() {
    setCreatingPdf(true);
    try {
      const payload = buildPayload();
      if (!payload.items.length) {
        throw new Error('Ajoutez au moins une ligne avec une description pour prévisualiser le PDF.');
      }
      const existingQuote = mode === 'edit' ? items.find((item) => item.id === editingId) : null;
      setPdfPreview(await createQuotePdf({
        ...payload,
        number: existingQuote?.number || 'BROUILLON',
        status: existingQuote?.status || 'draft',
        created_at: existingQuote?.created_at,
        total: totalCents
      }, branding));
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setCreatingPdf(false);
    }
  }

  return (
    <section className="quotes" aria-labelledby="quotes-heading">
      <header className="quotes__header">
        <div>
          <span className="admin-section-kicker">MODULE COMMERCIAL</span>
          <h2 id="quotes-heading">Devis</h2>
          <p>Créez, envoyez et suivez vos devis. Un devis accepté alimente votre chiffre d'affaires.</p>
        </div>
        {mode === null && (
          <button type="button" className="btn btn--primary" onClick={startCreate} disabled={busy}>
            + Nouveau devis
          </button>
        )}
      </header>

      {/* --- Résumé commercial --- */}
      <section className="quotes__stats" aria-label="Résumé des devis">
        <div className="quotes__stat quotes__stat--revenue">
          <span className="quotes__stat-label">Devis acceptés</span>
          <strong className="quotes__stat-value">{euro(stats.acceptedRevenue || 0)}</strong>
          <span className="quotes__stat-hint">chiffre d'affaires signé</span>
        </div>
        <div className="quotes__stat">
          <span className="quotes__stat-label">En attente</span>
          <strong className="quotes__stat-value">{(stats.sent || 0) + (stats.draft || 0)}</strong>
          <span className="quotes__stat-hint">envoyés + brouillons</span>
        </div>
        <div className="quotes__stat">
          <span className="quotes__stat-label">Acceptés</span>
          <strong className="quotes__stat-value">{stats.accepted || 0}</strong>
        </div>
        <div className="quotes__stat">
          <span className="quotes__stat-label">Total</span>
          <strong className="quotes__stat-value">{stats.total || 0}</strong>
        </div>
      </section>

      {/* --- Formulaire de création / édition --- */}
      {mode !== null && (
        <form className="quotes__form" onSubmit={submit}>
          <h3>{mode === 'edit' ? 'Modifier le devis' : 'Nouveau devis'}</h3>
          <div className="quotes__form-grid">
            <label style={{ gridColumn: '1 / -1' }}>Client existant
              <select value="" onChange={(event) => event.target.value && pickClient(event.target.value)}>
                <option value="">{knownClients.length ? 'Choisir un client existant…' : 'Aucun client enregistré'}</option>
                {knownClients.map((client) => (
                  <option key={`${client.name}-${client.email}`} value={client.name}>
                    {client.name}{client.email ? ` · ${client.email}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>Nom du client *
              <input
                list="quote-known-clients"
                value={form.client_name}
                onChange={(event) => pickClient(event.target.value)}
                maxLength={100}
                placeholder="Tapez ou choisissez un client existant"
                autoComplete="off"
                required
              />
              <datalist id="quote-known-clients">
                {knownClients.map((client) => (
                  <option key={`${client.name}-${client.email}`} value={client.name}>{client.email}</option>
                ))}
              </datalist>
            </label>
            <label>E-mail du client *
              <input type="email" value={form.client_email} onChange={(event) => updateField('client_email', event.target.value)} maxLength={254} required />
            </label>
            <label>Téléphone
              <input value={form.client_phone} onChange={(event) => updateField('client_phone', event.target.value)} maxLength={40} />
            </label>
            <label>Prestation
              <input value={form.service} onChange={(event) => updateField('service', event.target.value)} maxLength={100} placeholder="Ex. Mariage" />
            </label>
            <label>Valable jusqu'au
              <input type="date" value={form.valid_until} onChange={(event) => updateField('valid_until', event.target.value)} />
            </label>
          </div>

          <fieldset className="quotes__items">
            <legend>Lignes du devis</legend>
            {form.items.map((item, index) => (
              <div className="quotes__item-row" key={index}>
                <input
                  className="quotes__item-desc"
                  value={item.description}
                  onChange={(event) => updateItem(index, 'description', event.target.value)}
                  placeholder="Description de la prestation"
                  maxLength={300}
                  aria-label="Description"
                />
                <input
                  className="quotes__item-qty"
                  type="number" min="1" step="1"
                  value={item.quantity}
                  onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                  aria-label="Quantité"
                />
                <input
                  className="quotes__item-price"
                  type="number" min="0" step="0.01"
                  value={item.unit_price}
                  onChange={(event) => updateItem(index, 'unit_price', event.target.value)}
                  aria-label="Prix unitaire en euros"
                />
                <span className="quotes__item-total">
                  {euro(Math.round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * 100))}
                </span>
                <button type="button" className="text-button text-button--danger" onClick={() => removeItem(index)} disabled={form.items.length <= 1} aria-label="Supprimer la ligne">
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="button button--outline button--small" onClick={addItem} disabled={busy || form.items.length >= 50}>
              + Ajouter une ligne
            </button>
            <div className="quotes__total-row">
              <span>Total</span>
              <strong>{euro(totalCents)}</strong>
            </div>
          </fieldset>

          <label className="quotes__notes">Notes
            <textarea value={form.notes} onChange={(event) => updateField('notes', event.target.value)} rows={3} maxLength={2000} />
          </label>

          <div className="quotes__form-actions">
            <button type="button" className="btn btn--ghost" onClick={previewFormPdf} disabled={busy || creatingPdf}>
              {creatingPdf ? 'Préparation du PDF…' : 'Aperçu PDF des modifications'}
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {mode === 'edit' ? 'Enregistrer' : 'Créer le devis'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={cancelForm} disabled={busy}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* --- Liste des devis --- */}
      {mode === null && (
        <div className="quotes__list">
          {loading ? (
            <p className="quotes__empty">Chargement des devis…</p>
          ) : items.length === 0 ? (
            <p className="quotes__empty">Aucun devis pour le moment. Cliquez sur « Nouveau devis » pour commencer.</p>
          ) : (
            items.map((quote) => (
              <article key={quote.id} className={`quotes__item ${statusClass[quote.status]}`}>
                <header className="quotes__item-header">
                  <div>
                    <span className="admin-section-kicker">{quote.number}</span>
                    <h3>{quote.client_name}</h3>
                    <p className="quotes__item-meta">
                      {quote.service && <span>{quote.service} · </span>}
                      {getQuoteItems(quote).length} ligne{getQuoteItems(quote).length === 1 ? '' : 's'} · <strong>{euro(quote.total)}</strong>
                    </p>
                    {quote.client_email && <p className="quotes__item-meta">✉️ <a href={`mailto:${quote.client_email}`}>{quote.client_email}</a></p>}
                    {quote.client_phone && <p className="quotes__item-meta">📞 {quote.client_phone}</p>}
                    {quote.valid_until && <p className="quotes__item-meta">Valable jusqu'au {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${quote.valid_until}T00:00:00`))}</p>}
                    {quote.sent_at && <p className="quotes__item-meta quotes__item-meta--sent">Envoyé le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(quote.sent_at))}</p>}
                  </div>
                  <span className={`quotes__chip ${statusClass[quote.status]}`}>{statuses[quote.status]}</span>
                </header>
                <footer className="quotes__item-actions">
                  <select value={quote.status} onChange={(event) => changeStatus(quote.id, event.target.value)} disabled={busy} aria-label="Statut du devis">
                    {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="button" className="btn btn--outline btn--small" onClick={() => previewPdf(quote)} disabled={creatingPdf}>
                    {creatingPdf ? 'Préparation…' : 'Aperçu PDF'}
                  </button>
                  <button type="button" className="btn btn--primary btn--small" onClick={() => send(quote)} disabled={busy}>
                    ✉️ Envoyer
                  </button>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => startEdit(quote)} disabled={busy}>
                    Modifier
                  </button>
                  <button type="button" className="btn btn--danger btn--small" onClick={() => remove(quote)} disabled={busy}>
                    Supprimer
                  </button>
                </footer>
              </article>
            ))
          )}
        </div>
      )}
      {pdfPreview && <PdfPreviewModal file={pdfPreview} onClose={() => setPdfPreview(null)} />}
      {pdfPreview && <PdfPreviewModal file={pdfPreview} onClose={() => setPdfPreview(null)} />}
    </section>
  );
}
