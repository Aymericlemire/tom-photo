import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, formatDateForInput } from '../api.js';

const STAGES = [
  ['lead', 'Nouveau prospect'],
  ['contacted', 'Contacté'],
  ['qualified', 'Qualifié'],
  ['quote_sent', 'Devis envoyé'],
  ['booked', 'Réservé'],
  ['customer', 'Client'],
  ['lost', 'Perdu']
];

const STAGE_PROBABILITY = {
  lead: 10,
  contacted: 20,
  qualified: 40,
  quote_sent: 70,
  booked: 90,
  customer: 100,
  lost: 0
};

const SOURCES = {
  inquiry: 'Demande',
  quote: 'Devis',
  appointment: 'Rendez-vous'
};

const emptyNewContact = () => ({
  name: '',
  email: '',
  phone: '',
  company: '',
  stage: 'lead',
  notes: ''
});

const emptyActivity = () => ({
  kind: 'task',
  title: '',
  details: '',
  due_date: formatDateForInput()
});

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

function money(cents) {
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default function CRMManager({ onError }) {
  const [data, setData] = useState({ items: [], stats: { total: 0, active: 0, tasksDue: 0, stages: {} } });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [view, setView] = useState('pipeline');
  const [selectedId, setSelectedId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [newContact, setNewContact] = useState(null);
  const [activityForm, setActivityForm] = useState(null);
  const [notice, setNotice] = useState('');
  const [draggedId, setDraggedId] = useState(null);
  const [updatingStageId, setUpdatingStageId] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await api('/api/admin/crm');
      setData(result);
      setSelectedId((current) => (
        current && result.items.some((contact) => contact.id === current)
          ? current
          : result.items[0]?.id ?? null
      ));
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedContact = data.items.find((contact) => contact.id === selectedId) || null;

  useEffect(() => {
    if (!selectedContact) {
      setEditForm(null);
      return;
    }
    setEditForm({
      name: selectedContact.name,
      email: selectedContact.email,
      phone: selectedContact.phone,
      company: selectedContact.company,
      stage: selectedContact.stage,
      notes: selectedContact.notes
    });
  }, [selectedContact?.id, selectedContact?.updated_at]);

  const visibleContacts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr-FR');
    return data.items.filter((contact) => {
      const matchesSearch = !needle || [
        contact.name, contact.email, contact.phone, contact.company, contact.notes
      ].some((value) => String(value || '').toLocaleLowerCase('fr-FR').includes(needle));
      return matchesSearch && (stageFilter === 'all' || contact.stage === stageFilter);
    });
  }, [data.items, search, stageFilter]);

  const pipeline = useMemo(() => STAGES.map(([stage, label]) => ({
    stage,
    label,
    contacts: visibleContacts.filter((contact) => contact.stage === stage)
  })), [visibleContacts]);

  const pipelineValue = useMemo(() => data.items.reduce((total, contact) => {
    if (['customer', 'lost'].includes(contact.stage)) return total;
    const quoteValue = contact.history
      .filter((event) => event.kind === 'quote')
      .reduce((sum, event) => sum + (event.amount || 0), 0);
    return total + Math.round(quoteValue * ((STAGE_PROBABILITY[contact.stage] || 0) / 100));
  }, 0), [data.items]);

  const dueFollowUps = useMemo(() => {
    const today = formatDateForInput();
    return data.items.flatMap((contact) => contact.activities
      .filter((activity) => activity.kind === 'task' && !activity.completed_at && activity.due_date && activity.due_date <= today)
      .map((activity) => ({ ...activity, contactName: contact.name, contactId: contact.id })))
      .sort((left, right) => left.due_date.localeCompare(right.due_date));
  }, [data.items]);

  const saveNewContact = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api('/api/admin/crm', {
        method: 'POST',
        body: JSON.stringify(newContact)
      });
      setNewContact(null);
      await load({ quiet: true });
      setSelectedId(result.contact.id);
      setNotice(result.created
        ? 'La fiche client a été créée.'
        : 'Une fiche avec cet e-mail ou ce téléphone existe déjà : elle a été sélectionnée.');
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveContact = async (event) => {
    event.preventDefault();
    if (!selectedContact || !editForm) return;
    setSaving(true);
    try {
      await api(`/api/admin/crm/${selectedContact.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm)
      });
      await load({ quiet: true });
      setNotice('Les informations du client ont été enregistrées.');
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const changeStage = async (contact, stage) => {
    if (contact.stage === stage || updatingStageId) return;
    setUpdatingStageId(contact.id);
    setNotice('');
    try {
      await api(`/api/admin/crm/${contact.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage })
      });
      await load({ quiet: true });
      setNotice(`${contact.name} déplacé vers « ${STAGES.find(([value]) => value === stage)?.[1] || stage} ».`);
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setUpdatingStageId(null);
      setDraggedId(null);
    }
  };

  const saveActivity = async (event) => {
    event.preventDefault();
    if (!selectedContact || !activityForm) return;
    setSaving(true);
    try {
      await api(`/api/admin/crm/${selectedContact.id}/activities`, {
        method: 'POST',
        body: JSON.stringify(activityForm)
      });
      setActivityForm(null);
      await load({ quiet: true });
      setNotice('L’activité a été ajoutée au suivi.');
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (activity) => {
    if (!selectedContact) return;
    try {
      await api(`/api/admin/crm/${selectedContact.id}/activities/${activity.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !activity.completed_at })
      });
      await load({ quiet: true });
      onError('');
    } catch (error) {
      onError(error.message);
    }
  };

  const deleteActivity = async (activity) => {
    if (!selectedContact || !window.confirm(`Supprimer « ${activity.title} » ?`)) return;
    try {
      await api(`/api/admin/crm/${selectedContact.id}/activities/${activity.id}`, { method: 'DELETE' });
      await load({ quiet: true });
      onError('');
    } catch (error) {
      onError(error.message);
    }
  };

  const timeline = useMemo(() => {
    if (!selectedContact) return [];
    const activities = selectedContact.activities.map((activity) => ({
      ...activity,
      timelineKind: activity.kind,
      happened_at: activity.created_at
    }));
    return [...activities, ...selectedContact.history]
      .sort((left, right) => String(right.happened_at).localeCompare(String(left.happened_at)));
  }, [selectedContact]);

  return (
    <section className="crm" aria-labelledby="crm-heading">
      <header className="crm__header">
        <div>
          <span className="admin-section-kicker">RELATION CLIENT</span>
          <h2 id="crm-heading">CRM clients</h2>
          <p>Retrouvez au même endroit les demandes, les devis, les rendez-vous et vos relances.</p>
        </div>
        <div className="crm__header-actions">
          <button type="button" className="button button--outline button--small" onClick={() => load()} disabled={loading}>Actualiser</button>
          <button type="button" className="button button--dark button--small" onClick={() => { setNotice(''); setNewContact(emptyNewContact()); }}>+ Nouveau client</button>
        </div>
      </header>
      {notice && <p className="crm__notice" role="status">{notice}</p>}

      <div className="crm__stats" aria-label="Résumé CRM">
        <article><span>CONTACTS</span><strong>{data.stats.total}</strong><small>{data.stats.active} opportunité{data.stats.active === 1 ? '' : 's'} active{data.stats.active === 1 ? '' : 's'}</small></article>
        <article><span>VALEUR PONDÉRÉE</span><strong>{money(pipelineValue)}</strong><small>estimation selon l’étape commerciale</small></article>
        <article className={dueFollowUps.length ? 'has-alert' : ''}><span>RELANCES EN RETARD</span><strong>{dueFollowUps.length}</strong><small>à traiter aujourd’hui ou en retard</small></article>
        <article><span>DEVIS EN ATTENTE</span><strong>{data.stats.stages?.quote_sent || 0}</strong><small>prospects à recontacter</small></article>
      </div>

      {newContact && (
        <form className="crm__new-contact" onSubmit={saveNewContact}>
          <div className="crm__panel-heading">
            <div><h3>Créer une fiche client</h3><p>Une fiche existante est réutilisée si l’e-mail ou le téléphone correspond.</p></div>
            <button type="button" className="text-button" onClick={() => setNewContact(null)}>Annuler</button>
          </div>
          <div className="crm__form-grid">
            <label>Nom complet<input required minLength="2" maxLength="100" value={newContact.name} onChange={(event) => setNewContact({ ...newContact, name: event.target.value })} /></label>
            <label>E-mail<input type="email" maxLength="254" value={newContact.email} onChange={(event) => setNewContact({ ...newContact, email: event.target.value })} /></label>
            <label>Téléphone<input maxLength="40" value={newContact.phone} onChange={(event) => setNewContact({ ...newContact, phone: event.target.value })} /></label>
            <label>Entreprise<input maxLength="120" value={newContact.company} onChange={(event) => setNewContact({ ...newContact, company: event.target.value })} /></label>
          </div>
          <button type="submit" className="button button--dark button--small" disabled={saving}>{saving ? 'Enregistrement…' : 'Créer la fiche'}</button>
        </form>
      )}

      <div className="crm__toolbar">
        <div className="crm__search">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Rechercher un client" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un client, e-mail ou téléphone…" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche">×</button>}
        </div>
        <div className="crm__toolbar-end">
          <label className="crm__stage-filter">Étape
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
              <option value="all">Toutes les étapes</option>
              {STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="crm__view-switch" role="tablist" aria-label="Vue CRM">
            <button type="button" role="tab" aria-selected={view === 'pipeline'} className={view === 'pipeline' ? 'is-active' : ''} onClick={() => setView('pipeline')}>Pipeline</button>
            <button type="button" role="tab" aria-selected={view === 'contacts'} className={view === 'contacts' ? 'is-active' : ''} onClick={() => setView('contacts')}>Contacts</button>
          </div>
        </div>
      </div>

      {view === 'pipeline' ? (
        <div className="crm__pipeline-wrap">
          <div className="crm__pipeline-summary">
            <div><strong>{visibleContacts.length}</strong> contact{visibleContacts.length === 1 ? '' : 's'} dans le pipeline</div>
            <span>Glissez un contact dans une autre étape pour mettre à jour son suivi.</span>
          </div>
          <div className="crm__pipeline" aria-label="Pipeline commercial par étape">
            {pipeline.map((column) => {
              const amount = column.contacts.reduce((sum, contact) => (
                sum + contact.history
                  .filter((event) => event.kind === 'quote')
                  .reduce((quoteSum, event) => quoteSum + (event.amount || 0), 0)
              ), 0);
              return (
                <section
                  className={`crm__stage-column crm__stage-column--${column.stage}${draggedId ? ' is-drop-ready' : ''}`}
                  key={column.stage}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const contact = data.items.find((item) => item.id === draggedId);
                    if (contact) changeStage(contact, column.stage);
                  }}
                  aria-label={`${column.label} : ${column.contacts.length} contacts`}
                >
                  <header className="crm__stage-column-head">
                    <div><i /><h3>{column.label}</h3><span>{column.contacts.length}</span></div>
                    <small>{money(amount)} en devis</small>
                  </header>
                  <div className="crm__stage-column-body">
                    {column.contacts.length ? column.contacts.map((contact) => {
                      const latest = contact.history[0];
                      const quoteTotal = contact.history
                        .filter((event) => event.kind === 'quote')
                        .reduce((sum, event) => sum + (event.amount || 0), 0);
                      const nextTask = contact.activities.find((activity) => (
                        activity.kind === 'task' && !activity.completed_at
                      ));
                      return (
                        <article
                          className={`crm__deal-card${draggedId === contact.id ? ' is-dragging' : ''}`}
                          key={contact.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', String(contact.id));
                            setDraggedId(contact.id);
                          }}
                          onDragEnd={() => setDraggedId(null)}
                        >
                          <button type="button" className="crm__deal-main" onClick={() => { setSelectedId(contact.id); setActivityForm(null); setView('contacts'); }}>
                            <span className="crm__deal-title">{contact.name}</span>
                            {contact.company && <span className="crm__deal-company">{contact.company}</span>}
                            <span className="crm__deal-email">{contact.email || contact.phone || 'Coordonnées à compléter'}</span>
                            <span className="crm__deal-bottom">
                              {quoteTotal > 0 ? <strong>{money(quoteTotal)}</strong> : <span className="crm__deal-no-value">Pas de devis</span>}
                              <span>{contact.history.length} échange{contact.history.length === 1 ? '' : 's'}</span>
                            </span>
                            {nextTask && <span className="crm__deal-task">↗ {nextTask.title} · {formatDate(nextTask.due_date)}</span>}
                            {!nextTask && latest && <span className="crm__deal-last">Dernière activité · {formatDate(latest.happened_at)}</span>}
                          </button>
                          <footer className="crm__deal-footer">
                            <span className="crm__deal-source">{latest ? SOURCES[latest.kind] || 'Activité' : 'Fiche manuelle'}</span>
                            <select
                              aria-label={`Étape de ${contact.name}`}
                              value={contact.stage}
                              disabled={updatingStageId === contact.id}
                              onChange={(event) => changeStage(contact, event.target.value)}
                            >
                              {STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </footer>
                        </article>
                      );
                    }) : <p className="crm__column-empty">Aucun contact à cette étape</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
      <div className="crm__workspace">
        <aside className="crm__directory" aria-label="Répertoire clients">
          <div className="crm__directory-heading"><h3>Répertoire</h3><span>{visibleContacts.length} contact{visibleContacts.length === 1 ? '' : 's'}</span></div>
          {loading ? (
            <p className="crm__empty">Chargement des contacts…</p>
          ) : visibleContacts.length ? (
            <div className="crm__contact-list">
              {visibleContacts.map((contact) => (
                <button
                  type="button"
                  key={contact.id}
                  className={`crm__contact${selectedId === contact.id ? ' is-selected' : ''}`}
                  onClick={() => { setSelectedId(contact.id); setActivityForm(null); }}
                >
                  <span className="crm__avatar" aria-hidden="true">{contact.name.slice(0, 1).toLocaleUpperCase('fr-FR')}</span>
                  <span className="crm__contact-copy">
                    <strong>{contact.name}</strong>
                    <small>{contact.email || contact.phone || 'Coordonnées à compléter'}</small>
                    {contact.next_follow_up && <small className="crm__follow-up">Relance : {formatDate(contact.next_follow_up)}</small>}
                  </span>
                  <span className={`crm__stage crm__stage--${contact.stage}`}>{STAGES.find(([value]) => value === contact.stage)?.[1] || contact.stage}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="crm__empty">{data.items.length ? 'Aucun contact ne correspond à ce filtre.' : 'Aucun contact pour le moment. Les demandes, devis et rendez-vous seront regroupés automatiquement ici.'}</p>
          )}
        </aside>

        {selectedContact && editForm ? (
          <div className="crm__detail">
            <form className="crm__profile" onSubmit={saveContact}>
              <div className="crm__panel-heading">
                <div><span className="admin-section-kicker">FICHE CLIENT #{selectedContact.id}</span><h3>{selectedContact.name}</h3></div>
                <button type="submit" className="button button--dark button--small" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
              <div className="crm__form-grid">
                <label>Nom complet<input required minLength="2" maxLength="100" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
                <label>E-mail<input type="email" maxLength="254" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></label>
                <label>Téléphone<input maxLength="40" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></label>
                <label>Entreprise<input maxLength="120" value={editForm.company} onChange={(event) => setEditForm({ ...editForm, company: event.target.value })} /></label>
                <label>Étape commerciale<select value={editForm.stage} onChange={(event) => setEditForm({ ...editForm, stage: event.target.value })}>{STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="crm__wide">Notes privées<textarea rows="3" maxLength="4000" value={editForm.notes} onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })} placeholder="Préférences, informations utiles, contexte…" /></label>
              </div>
            </form>

            <section className="crm__activity">
              <div className="crm__panel-heading">
                <div><h3>Notes et relances</h3><p>Gardez les prochaines actions et les informations de suivi dans la fiche.</p></div>
                {!activityForm && <button type="button" className="button button--outline button--small" onClick={() => setActivityForm(emptyActivity())}>+ Ajouter</button>}
              </div>
              {activityForm && (
                <form className="crm__activity-form" onSubmit={saveActivity}>
                  <label>Type<select value={activityForm.kind} onChange={(event) => setActivityForm({ ...activityForm, kind: event.target.value, due_date: event.target.value === 'task' ? formatDateForInput() : '' })}><option value="task">Relance à faire</option><option value="note">Note d’activité</option></select></label>
                  <label className="crm__wide">Titre<input required minLength="2" maxLength="160" value={activityForm.title} onChange={(event) => setActivityForm({ ...activityForm, title: event.target.value })} placeholder={activityForm.kind === 'task' ? 'Ex. Appeler pour confirmer la date' : 'Ex. Préfère les photos en extérieur'} /></label>
                  {activityForm.kind === 'task' && <label>Date de relance<input required type="date" value={activityForm.due_date} onChange={(event) => setActivityForm({ ...activityForm, due_date: event.target.value })} /></label>}
                  <label className="crm__wide">Détails<textarea rows="2" maxLength="2000" value={activityForm.details} onChange={(event) => setActivityForm({ ...activityForm, details: event.target.value })} /></label>
                  <div className="crm__form-actions">
                    <button type="button" className="button button--outline button--small" onClick={() => setActivityForm(null)}>Annuler</button>
                    <button type="submit" className="button button--dark button--small" disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter au suivi'}</button>
                  </div>
                </form>
              )}
              {selectedContact.activities.length > 0 && (
                <div className="crm__activity-list">
                  {selectedContact.activities.map((activity) => (
                    <article className={`crm__activity-card${activity.completed_at ? ' is-complete' : ''}`} key={`activity-${activity.id}`}>
                      {activity.kind === 'task' && (
                        <input
                          type="checkbox"
                          checked={Boolean(activity.completed_at)}
                          onChange={() => toggleTask(activity)}
                          aria-label={`${activity.completed_at ? 'Réouvrir' : 'Terminer'} ${activity.title}`}
                        />
                      )}
                      <div><strong>{activity.title}</strong><small>{activity.kind === 'task' ? `Relance · ${formatDate(activity.due_date)}` : `Note · ${formatDate(activity.created_at)}`}</small>{activity.details && <p>{activity.details}</p>}</div>
                      <button type="button" className="text-button text-button--danger" onClick={() => deleteActivity(activity)} aria-label={`Supprimer ${activity.title}`}>Supprimer</button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="crm__history">
              <div className="crm__panel-heading"><div><h3>Historique client</h3><p>Les enregistrements existants des autres modules restent inchangés.</p></div><span className="crm__history-count">{timeline.length} activité{timeline.length > 1 ? 's' : ''}</span></div>
              {timeline.length ? (
                <ol className="crm__timeline">
                  {timeline.map((event) => (
                    <li key={event.id || `${event.timelineKind}-${event.created_at}`}>
                      <i className={`crm__timeline-dot crm__timeline-dot--${event.kind || event.timelineKind}`} aria-hidden="true" />
                      <div>
                        <div className="crm__timeline-heading"><strong>{event.title}</strong><time>{formatDate(event.happened_at)}</time></div>
                        {event.details && <p>{event.details}</p>}
                        {event.amount !== null && event.amount !== undefined && <small className="crm__timeline-amount">{money(event.amount)}</small>}
                        <small className="crm__timeline-status">
                          {SOURCES[event.kind] || (event.timelineKind === 'task' ? 'Relance' : 'Note')}
                          {event.status && ` · ${event.status}`}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className="crm__empty">Aucun échange enregistré. Ajoutez une note ou une première relance.</p>}
            </section>
          </div>
        ) : (
          <div className="crm__detail crm__empty-detail"><p>Sélectionnez un client dans la liste pour consulter et modifier sa fiche.</p></div>
        )}
      </div>
        )}

        {dueFollowUps.length > 0 && (
          <section className="crm__follow-ups" aria-label="Relances prioritaires">
            <header><div><span className="admin-section-kicker">À FAIRE</span><h3>Relances prioritaires</h3></div><span>{dueFollowUps.length} en retard ou à traiter aujourd’hui</span></header>
            <div className="crm__follow-up-list">
              {dueFollowUps.slice(0, 5).map((task) => (
                <button type="button" key={task.id} onClick={() => { setSelectedId(task.contactId); setView('contacts'); }}>
                  <span className="crm__follow-up-date">{formatDate(task.due_date)}</span>
                  <span><strong>{task.title}</strong><small>{task.contactName}</small></span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </section>
        )}
    </section>
  );
}
