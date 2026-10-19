// Lightbox.jsx
// -----------------------------------------------------------------------------
// La VISIONNEUSE PLEIN ÉCRAN de la galerie (le réflexe "pro" d'un site photo).
// Quand le visiteur clique une photo, elle s'ouvre en grand et il peut :
//   • naviguer avec les flèches ◀ ▶ (boutons ou clavier ← →)
//   • fermer avec la croix, la touche Échap, ou un clic sur le fond
//   • voir une vignette de chaque visuel en bas et sauter directement dessus
//   • lire les vidéos en grand (avec contrôles)
// On affiche aussi un compteur (ex. "3 / 12") et la légende de la photo.
//
// Props :
//   items     → le tableau des visuels affichés (photos + vidéos)
//   startIndex→ l'index du visuel à ouvrir en premier
//   onClose   → fonction appelée pour fermer la visionneuse
// -----------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';

export default function Lightbox({ items, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const total = items.length;

  // Aller au visuel suivant (boucle à la fin).
  const next = useCallback(() => setIndex((i) => (i + 1) % total), [total]);
  // Aller au visuel précédent (boucle au début).
  const prev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total]);

  // --- Navigation au clavier : ← → pour changer, Échap pour fermer ---
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose();
      else if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      else if (event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    closeButtonRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll(
      'button:not([disabled]), a[href], video[controls], [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Si l'index change (ex. liste modifiée), on s'assure qu'il reste valide.
  useEffect(() => {
    if (index > total - 1) setIndex(0);
  }, [index, total]);

  if (!total) return null;
  const item = items[index];
  const isVideo = item.type === 'video' && item.video;

  return (
    <div
      className="lightbox"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Visionneuse de la galerie"
      tabIndex="-1"
      onKeyDown={trapFocus}
    >
      {/* Fond sombre : un clic dessus ferme la visionneuse */}
      <div className="lightbox__backdrop" onClick={onClose} />

      {/* Barre du haut : compteur + bouton fermer */}
      <div className="lightbox__topbar">
        <span className="lightbox__counter">{index + 1} / {total}</span>
        <button ref={closeButtonRef} className="lightbox__close" type="button" onClick={onClose} aria-label="Fermer">✕</button>
      </div>

      {/* Flèche précédent */}
      {total > 1 && (
        <button className="lightbox__nav lightbox__nav--prev" type="button" onClick={prev} aria-label="Visuel précédent">‹</button>
      )}

      {/* Le visuel en grand */}
      <figure className="lightbox__stage" key={index}>
        {isVideo ? (
          <video className="lightbox__media" src={item.video} poster={item.image} controls autoPlay playsInline />
        ) : (
          <img className="lightbox__media" src={item.image} alt={item.title} />
        )}
        {/* Légende (titre + description) */}
        <figcaption className="lightbox__caption">
          <strong>{item.title}</strong>
          {item.description && <span>{item.description}</span>}
        </figcaption>
      </figure>

      {/* Flèche suivant */}
      {total > 1 && (
        <button className="lightbox__nav lightbox__nav--next" type="button" onClick={next} aria-label="Visuel suivant">›</button>
      )}

      {/* Bandeau de vignettes : cliquer pour sauter à un visuel */}
      {total > 1 && (
        <div className="lightbox__thumbs" role="tablist" aria-label="Vignettes">
          {items.map((thumb, i) => (
            <button
              type="button"
              key={`${thumb.image}-${i}`}
              className={`lightbox__thumb${i === index ? ' is-active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={thumb.title}
              aria-selected={i === index}
              role="tab"
            >
              <img src={thumb.image} alt="" loading="lazy" />
              {thumb.type === 'video' && <span className="lightbox__thumb-play" aria-hidden="true">▶</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
