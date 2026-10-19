import { useEffect, useState } from 'react';
import PageIntro from '../components/PageIntro.jsx';
import { api } from '../api.js';

function isTimeOccupied(time, appointments) {
  const [hours, minutes] = time.split(':').map(Number);
  const start = hours * 60 + minutes;
  return appointments.some((appointment) => {
    const [occupiedHours, occupiedMinutes] = appointment.time.split(':').map(Number);
    const occupiedStart = occupiedHours * 60 + occupiedMinutes;
    const occupiedDuration = Number.isInteger(appointment.duration) ? appointment.duration : 60;
    return start < occupiedStart + occupiedDuration && occupiedStart < start + 60;
  });
}

export default function ContactPage({ contact, site }) {
  const [status, setStatus] = useState({ type: '', text: '' });
  const [sending, setSending] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [takenSlots, setTakenSlots] = useState([]);
  const [availability, setAvailability] = useState({ month: '', loading: true, error: '' });
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const monthKey = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}`;
  const availabilityReady = availability.month === monthKey && !availability.loading && !availability.error;

  useEffect(() => {
    const controller = new AbortController();
    setAvailability({ month: monthKey, loading: true, error: '' });
    api(`/api/appointments/taken?month=${monthKey}`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setTakenSlots(result.taken);
        setAvailability({ month: monthKey, loading: false, error: '' });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setAvailability({ month: monthKey, loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [monthKey]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const calendarDays = [
    ...Array.from({ length: firstWeekday }, (_, index) => ({ key: `blank-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1);
      const value = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-');
      const daySlots = takenSlots.filter((slot) => slot.date === value);
      const hasAvailableTime = contact.times.some((time) => !isTimeOccupied(time, daySlots));
      const unavailable = contact.unavailableDates.includes(value)
        || (availabilityReady && !hasAvailableTime);
      return {
        key: value,
        value,
        day: index + 1,
        disabled: date < today || unavailable || !availabilityReady,
        unavailable,
        isToday: date.getTime() === today.getTime()
      };
    })
  ];
  const selectedDateObject = selectedDate
    ? new Date(`${selectedDate}T00:00:00`)
    : null;
  const selectedDateSlots = takenSlots.filter((slot) => slot.date === selectedDate);
  const availableTimes = availabilityReady && selectedDate
    ? contact.times.filter((time) => {
      if (isTimeOccupied(time, selectedDateSlots)) return false;
      if (selectedDateObject.getTime() !== today.getTime()) return true;
      const [hour, minute] = time.split(':').map(Number);
      return hour * 60 + minute > today.getHours() * 60 + today.getMinutes();
    })
    : [];
  const monthLabel = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric'
  }).format(visibleMonth);
  const selectedDateLabel = selectedDateObject
    ? new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(selectedDateObject)
    : '';

  function selectDate(value) {
    setSelectedDate(value);
    setSelectedTime('');
  }

  function changeMonth(offset) {
    setSelectedDate('');
    setSelectedTime('');
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  async function submit(event) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setSending(true);
    setStatus({ type: '', text: '' });
    try {
      const result = await api('/api/contact', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      setStatus({ type: 'success', text: result.message });
      form.reset();
      setSelectedDate('');
      setSelectedTime('');
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageIntro eyebrow={contact.eyebrow} title={contact.title} intro={contact.intro} />
      <section className="section-wrap contact-layout">
        <aside className="contact-panel">
          <span className="eyebrow">{contact.panelEyebrow}</span>
          <h2>{contact.panelTitle}</h2>
          <p>{contact.panelDescription}</p>
          <dl>
            <div><dt>{contact.emailLabel}</dt><dd><a href={`mailto:${site.email}`}>{site.email}</a></dd></div>
            {site.phone && <div><dt>{contact.phoneLabel}</dt><dd><a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}>{site.phone}</a></dd></div>}
            <div><dt>{contact.zoneLabel}</dt><dd>{site.city} et alentours</dd></div>
          </dl>
        </aside>
        <form className="contact-form" onSubmit={submit}>
          <h2>{contact.formTitle}</h2>
          <p className="form-intro">{contact.formIntro}</p>
          <section className="booking-calendar" aria-labelledby="calendar-heading">
            <div className="booking-calendar__heading">
              <div>
                <span className="eyebrow eyebrow--dark">{contact.calendarEyebrow}</span>
                <h3 id="calendar-heading">{contact.calendarTitle}</h3>
              </div>
              <span className="booking-calendar__optional">{contact.calendarOptional}</span>
            </div>
            <div className="calendar-nav">
              <button
                type="button"
                aria-label="Mois précédent"
                disabled={visibleMonth.getFullYear() === today.getFullYear() && visibleMonth.getMonth() === today.getMonth()}
                onClick={() => changeMonth(-1)}
              >
                ←
              </button>
              <h4 aria-live="polite">{monthLabel}</h4>
              <button type="button" aria-label="Mois suivant" onClick={() => changeMonth(1)}>→</button>
            </div>
            <div className="calendar-grid" role="grid" aria-label={`Calendrier, ${monthLabel}`}>
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((weekday) => (
                <span className="day-name" role="columnheader" key={weekday}>{weekday}</span>
              ))}
              {calendarDays.map((day) => day.value ? (
                <button
                  className={`day-cell${day.isToday ? ' today' : ''}${day.value === selectedDate ? ' selected' : ''}${day.unavailable ? ' unavailable' : ''}`}
                  type="button"
                  role="gridcell"
                  key={day.key}
                  disabled={day.disabled}
                  aria-pressed={day.value === selectedDate}
                  aria-label={`${new Intl.DateTimeFormat('fr-FR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  }).format(new Date(`${day.value}T00:00:00`))}${day.unavailable ? ` — ${contact.calendarUnavailable}` : ''}`}
                  title={day.unavailable ? contact.calendarUnavailable : undefined}
                  onClick={() => selectDate(day.value)}
                >
                  {day.day}
                </button>
              ) : (
                <span className="day-cell empty" aria-hidden="true" key={day.key} />
              ))}
            </div>
            <div className="booking-selection" aria-live="polite">
              {selectedDateLabel
                ? <p>{contact.calendarSelectedPrefix} <strong>{selectedDateLabel}</strong></p>
                : <p>{contact.calendarSelectHint}</p>}
            </div>
            {selectedDate && (
              <div className="time-slots" aria-label="Horaires indicatifs">
                {availableTimes.length
                  ? availableTimes.map((time) => (
                    <button
                      className={`slot-btn${selectedTime === time ? ' selected' : ''}`}
                      type="button"
                      aria-pressed={selectedTime === time}
                      key={time}
                      onClick={() => setSelectedTime(time)}
                    >
                      {time}
                    </button>
                  ))
                  : <p className="booking-empty">{contact.calendarNoTimes}</p>}
              </div>
            )}
            <input type="hidden" name="date" value={selectedDate} />
            <input type="hidden" name="time" value={selectedTime} />
            <p className="booking-note" aria-live="polite">
              {availability.loading
                ? 'Vérification des disponibilités…'
                : availability.error
                  ? 'Les disponibilités ne peuvent pas être vérifiées. Contactez-nous pour connaître les créneaux libres.'
                  : contact.calendarNote}
            </p>
          </section>
          <div className="form-grid">
            <label>{contact.nameLabel} *
              <input name="name" autoComplete="name" minLength="2" maxLength="100" required />
            </label>
            <label>{contact.emailLabel} *
              <input name="email" type="email" autoComplete="email" maxLength="254" required />
            </label>
            <label>{contact.phoneLabel}
              <input name="phone" type="tel" autoComplete="tel" maxLength="40" />
            </label>
            <label>{contact.serviceLabel} *
              <select name="service" required defaultValue="">
                <option value="" disabled>{contact.servicePlaceholder}</option>
                {contact.services.map((service) => <option key={service}>{service}</option>)}
              </select>
            </label>
            <label className="field-wide">{contact.locationLabel}
              <input name="location" maxLength="160" />
            </label>
            <label className="field-wide">{contact.messageLabel} *
              <textarea name="message" minLength="5" maxLength="4000" rows="6" placeholder={contact.projectPlaceholder} required />
            </label>
            <label className="honeypot" aria-hidden="true" tabIndex="-1">Site web
              <input name="website" autoComplete="off" tabIndex="-1" />
            </label>
          </div>
          <p className="booking-note">{contact.reservationNote}</p>
          <button className="button button--dark" type="submit" disabled={sending}>
            {sending ? 'Envoi en cours…' : contact.submitLabel}
          </button>
          {status.text && <p className={`form-status form-status--${status.type}`} role="status">{status.text}</p>}
        </form>
      </section>
    </>
  );
}
