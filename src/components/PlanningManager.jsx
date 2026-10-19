// PlanningManager.jsx - Gestion du planning des rendez-vous (version optimisée)
// =============================================================================
// Composant React pour gérer les rendez-vous de Tom (côté admin)
// - Calendrier mensuel interactif
// - CRUD complet (Créer, Lire, Mettre à jour, Supprimer)
// - Gestion des statuts (en attente, confirmé, terminé, annulé)
// - Suivi du chiffre d'affaires mensuel
// - Données via API REST: /api/admin/appointments
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

// Constantes et utilitaires
// -------------------------
const STATUS_LABELS = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé'
};

const STATUS_CLASSES = {
  pending: 'is-pending',
  confirmed: 'is-confirmed',
  completed: 'is-completed',
  cancelled: 'is-cancelled'
};

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const formatMonth = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const formatDate = (date) => {
  const d = new Date(date);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
};

const formatCurrency = (cents) => {
  const euros = cents / 100;
  return `${euros.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
};

// Fonction utilitaire pour construire la grille du calendrier
const buildMonthGrid = (visibleMonth, appointmentsByDate) => {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = lundi
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  // Cases vides avant le 1er du mois
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ key: `blank-${i}`, blank: true });
  }

  // Jours du mois
  for (let day = 1; day <= daysInMonth; day++) {
    const dateValue = formatDate(new Date(year, month, day));
    const dayAppointments = appointmentsByDate[dateValue] || [];

    cells.push({
      key: dateValue,
      blank: false,
      value: dateValue,
      day,
      count: dayAppointments.length,
      hasPending: dayAppointments.some(a => a.status === 'pending')
    });
  }

  return cells;
};

// Formulaire initial vide
const getEmptyForm = (date) => ({
  client_name: '',
  client_email: '',
  client_phone: '',
  service: '',
  date: date || '',
  time: '10:00',
  duration: 60,
  price: 0,
  notes: '',
  status: 'pending'
});

// Composant principal
// ==================
export default function PlanningManager({ onError }) {
  // État
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => formatDate(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState({
    total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0, revenue: 0
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // null, 'create', 'edit'
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => getEmptyForm(formatDate(new Date())));
  const [draggedAppointmentId, setDraggedAppointmentId] = useState(null);

  // Formatage des dates
  const monthValue = formatMonth(visibleMonth);
  const todayValue = formatDate(new Date());
  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date(`${selectedDate}T12:00:00`))
    : '';

  // Chargement des données
  const loadAppointments = useCallback(async (month) => {
    setLoading(true);
    try {
      const data = await api(`/api/admin/appointments?month=${month}`);
      setAppointments(data.items || []);
      setStats(data.stats || {
        total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0, revenue: 0
      });
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadAppointments(monthValue);
  }, [monthValue, loadAppointments]);

  // Groupement des rendez-vous par date
  const appointmentsByDate = useMemo(() => {
    return appointments.reduce((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [appointments]);

  // Construction de la grille du calendrier
  const cells = useMemo(
    () => buildMonthGrid(visibleMonth, appointmentsByDate),
    [visibleMonth, appointmentsByDate]
  );

  const selectedAppointments = appointmentsByDate[selectedDate] || [];
  const monthLabel = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric'
  }).format(visibleMonth);

  // Gestion des actions
  // -------------------

  const changeMonth = (offset) => {
    setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
    setMode(null);
    setEditingId(null);
  };

  const selectDay = (value) => {
    setSelectedDate(value);
    setMode(null);
    setEditingId(null);
  };

  const startCreate = () => {
    setForm(getEmptyForm(selectedDate));
    setMode('create');
    setEditingId(null);
  };

  const startEdit = (appointment) => {
    setForm({
      client_name: appointment.client_name,
      client_email: appointment.client_email,
      client_phone: appointment.client_phone || '',
      service: appointment.service || '',
      date: appointment.date,
      time: appointment.time,
      duration: appointment.duration,
      price: appointment.price / 100,
      notes: appointment.notes || '',
      status: appointment.status,
      paid: Boolean(appointment.paid)
    });
    setMode('edit');
    setEditingId(appointment.id);
  };

  const cancelForm = () => {
    setMode(null);
    setEditingId(null);
  };

  const updateField = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    try {
      // Conversion du prix en centimes
      const payload = {
        ...form,
        price: Math.round(Number(form.price) * 100)
      };

      // Création ou mise à jour
      if (mode === 'edit') {
        await api(`/api/admin/appointments/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      } else {
        await api('/api/admin/appointments', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      // Réinitialisation et rechargement
      setMode(null);
      setEditingId(null);
      await loadAppointments(monthValue);

      // Navigation si le rendez-vous est dans un autre mois
      const targetMonth = payload.date.slice(0, 7);
      if (targetMonth !== monthValue) {
        setVisibleMonth(new Date(
          Number(payload.date.slice(0, 4)),
          Number(payload.date.slice(5, 7)) - 1,
          1
        ));
        setSelectedDate(payload.date);
      }
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    setBusy(true);
    try {
      await api(`/api/admin/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      await loadAppointments(monthValue);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer définitivement ce rendez-vous ?')) return;

    setBusy(true);
    try {
      await api(`/api/admin/appointments/${id}`, { method: 'DELETE' });
      await loadAppointments(monthValue);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const moveAppointmentToDate = async (id, date) => {
    const appointment = appointments.find((item) => item.id === id);
    if (!appointment || appointment.date === date || busy) return;

    setBusy(true);
    try {
      await api(`/api/admin/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ date })
      });
      setSelectedDate(date);
      await loadAppointments(monthValue);
      onError('');
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
      setDraggedAppointmentId(null);
    }
  };

  // Rendu
  // =====
  return (
    <div className="planning">
      {/* Section statistiques mensuelles */}
      <section className="planning__stats" aria-label="Résumé du mois">
        <div className="planning__stat planning__stat--revenue">
          <span className="planning__stat-label">Chiffre d'affaires du mois</span>
          <strong className="planning__stat-value">{formatCurrency(stats.revenue || 0)}</strong>
          <span className="planning__stat-hint">RDV confirmés + terminés</span>
        </div>

        {[
          { label: 'Total', key: 'total' },
          { label: 'En attente', key: 'pending' },
          { label: 'Confirmés', key: 'confirmed' },
          { label: 'Terminés', key: 'completed' },
          { label: 'Annulés', key: 'cancelled' }
        ].map(({ label, key }) => (
          <div key={key} className="planning__stat">
            <span className="planning__stat-label">{label}</span>
            <strong className="planning__stat-value">{stats[key] || 0}</strong>
          </div>
        ))}
      </section>

      <div className="planning__layout">
        {/* Calendrier mensuel */}
        <section className="planning__calendar" aria-label="Calendrier">
          <header className="planning__calendar-head">
            <button
              type="button"
              className="button button--outline button--small"
              onClick={() => changeMonth(-1)}
              disabled={busy || loading}
              aria-label="Mois précédent"
            >
              ‹
            </button>
            <h3 style={{ textTransform: 'capitalize' }}>{monthLabel}</h3>
            <button
              type="button"
              className="button button--outline button--small"
              onClick={() => changeMonth(1)}
              disabled={busy || loading}
              aria-label="Mois suivant"
            >
              ›
            </button>
          </header>

          <div className="planning__weekdays">
            {WEEKDAYS.map(weekday => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="planning__grid">
            {cells.map(cell => {
              if (cell.blank) {
                return <span key={cell.key} className="planning__cell planning__cell--blank" aria-hidden="true" />;
              }

              const isSelected = cell.value === selectedDate;
              const isToday = cell.value === todayValue;
              const classes = [
                'planning__cell',
                isSelected ? 'is-selected' : '',
                isToday ? 'is-today' : '',
                cell.hasPending ? 'has-pending' : '',
                draggedAppointmentId !== null ? 'is-drop-target' : ''
              ].filter(Boolean).join(' ');

              return (
                <button
                  key={cell.key}
                  type="button"
                  className={classes}
                  onClick={() => selectDay(cell.value)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const transferValue = event.dataTransfer.getData('text/plain');
                    const id = transferValue ? Number(transferValue) : draggedAppointmentId;
                    if (id) moveAppointmentToDate(id, cell.value);
                  }}
                  aria-pressed={isSelected}
                  aria-label={`${cell.day}${cell.count ? `, ${cell.count} rendez-vous` : ''}${draggedAppointmentId !== null ? ', déposer pour déplacer le rendez-vous ici' : ''}`}
                >
                  <span className="planning__day">{cell.day}</span>
                  {cell.count > 0 && (
                    <span className="planning__badge" title={`${cell.count} rendez-vous`}>
                      {cell.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="planning__drag-hint">Pour changer une date, faites glisser le rendez-vous avec ↕ vers un autre jour. Pour changer l’heure, choisissez « Modifier ».</p>
          {(loading) && <p className="planning__loading">Chargement…</p>}
        </section>

        {/* Panneau du jour sélectionné */}
        <section className="planning__day-panel" aria-label={`Rendez-vous du ${selectedDateLabel}`}>
          <header className="planning__day-panel-head">
            <h3 style={{ textTransform: 'capitalize' }}>{selectedDateLabel}</h3>
            {mode === null && (
              <button
                type="button"
                className="button button--dark button--small"
                onClick={startCreate}
                disabled={busy || loading}
              >
                + Ajouter un rendez-vous
              </button>
            )}
          </header>

          {/* Formulaire d'ajout/modification */}
          {mode && (
            <form className="planning__form" onSubmit={handleSubmit}>
              <h4>{mode === 'edit' ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}</h4>

              <label>
                Client
                <input
                  type="text"
                  value={form.client_name}
                  onChange={(e) => updateField('client_name', e.target.value)}
                  required
                  maxLength={100}
                />
              </label>

              <div className="planning__form-row">
                <label>
                  E-mail
                  <input
                    type="email"
                    value={form.client_email}
                    onChange={(e) => updateField('client_email', e.target.value)}
                    required
                    maxLength={254}
                  />
                </label>
                <label>
                  Téléphone
                  <input
                    type="tel"
                    value={form.client_phone}
                    onChange={(e) => updateField('client_phone', e.target.value)}
                    maxLength={40}
                  />
                </label>
              </div>

              <label>
                Prestation
                <input
                  type="text"
                  value={form.service}
                  onChange={(e) => updateField('service', e.target.value)}
                  placeholder="Ex. : séance portrait, mariage…"
                  maxLength={100}
                />
              </label>

              <div className="planning__form-row">
                <label>
                  Date
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateField('date', e.target.value)}
                    required
                  />
                </label>
                <label>
                  Heure
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => updateField('time', e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="planning__form-row">
                <label>
                  Durée (min)
                  <input
                    type="number"
                    value={form.duration}
                    onChange={(e) => updateField('duration', e.target.value)}
                    min={15}
                    step={15}
                    required
                  />
                </label>
                <label>
                  Prix (€)
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => updateField('price', e.target.value)}
                    min={0}
                    step={0.5}
                  />
                </label>
              </div>

              <label>
                Statut
                <select
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label>
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={3}
                  maxLength={2000}
                />
              </label>

              <div className="planning__form-actions">
                <button
                  type="submit"
                  className="button button--dark button--small"
                  disabled={busy}
                >
                  {mode === 'edit' ? 'Enregistrer' : 'Créer le rendez-vous'}
                </button>
                <button
                  type="button"
                  className="button button--outline button--small"
                  onClick={cancelForm}
                  disabled={busy}
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          {/* Liste des rendez-vous du jour */}
          {mode === null && (
            <div className="planning__list">
              {selectedAppointments.length === 0 ? (
                <p className="planning__empty">Aucun rendez-vous ce jour-là.</p>
              ) : (
                [...selectedAppointments]
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map(appointment => (
                    <article
                      key={appointment.id}
                      className={`planning__item ${STATUS_CLASSES[appointment.status]}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const transferValue = event.dataTransfer.getData('text/plain');
                        const id = transferValue ? Number(transferValue) : draggedAppointmentId;
                        if (id) moveAppointmentToDate(id, selectedDate);
                      }}
                    >
                      <header>
                        <button
                          type="button"
                          className="planning__drag-handle"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', String(appointment.id));
                            setDraggedAppointmentId(appointment.id);
                          }}
                          onDragEnd={() => setDraggedAppointmentId(null)}
                          aria-label={`Déplacer le rendez-vous de ${appointment.client_name}`}
                          title="Faire glisser sur une autre date du calendrier"
                        >↕</button>
                        <strong>{appointment.time}</strong>
                        <span className="planning__item-client">{appointment.client_name}</span>
                        <span className={`planning__chip ${STATUS_CLASSES[appointment.status]}`}>
                          {STATUS_LABELS[appointment.status]}
                        </span>
                      </header>

                      <p className="planning__item-meta">
                        {appointment.service && <span>{appointment.service} · </span>}
                        <span>{appointment.duration} min · {formatCurrency(appointment.price)}</span>
                        {appointment.client_phone && <span> · 📞 {appointment.client_phone}</span>}
                        {appointment.client_email && <span> · ✉️ {appointment.client_email}</span>}
                      </p>

                      {appointment.notes && (
                        <p className="planning__item-notes">{appointment.notes}</p>
                      )}

                      <footer className="planning__item-actions">
                        <select
                          value={appointment.status}
                          onChange={(e) => handleStatusChange(appointment.id, e.target.value)}
                          disabled={busy}
                          aria-label="Statut"
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          className="button button--outline button--small"
                          onClick={() => startEdit(appointment)}
                          disabled={busy}
                        >
                          Modifier
                        </button>

                        <button
                          type="button"
                          className="text-button text-button--danger"
                          onClick={() => handleDelete(appointment.id)}
                          disabled={busy}
                        >
                          Supprimer
                        </button>
                      </footer>
                    </article>
                  ))
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}