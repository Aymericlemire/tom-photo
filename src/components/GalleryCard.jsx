// GalleryCard.jsx
// -----------------------------------------------------------------------------
// Tuile utilisée dans la GALERIE (page /galerie).
// Elle réutilise le même rendu "plein cadre" que les cartes de l'accueil
// (classes .home-photo) pour que tout soit cohérent visuellement.
// Toute la tuile est cliquable : au clic, on ouvre la visionneuse plein écran
// (Lightbox) sur ce visuel (prop onOpen).
// Deux possibilités :
//   - type "photo"  → on affiche une simple image
//   - type "video"  → on affiche l'affiche (poster) + un badge lecture
// -----------------------------------------------------------------------------

export default function GalleryCard({ item, onOpen }) {
  // Une carte est "vidéo" seulement si son type est video ET qu'un fichier vidéo existe.
  const isVideo = item.type === 'video' && item.video;

  return (
    // <button> pour que ce soit accessible au clavier (Entrée/Espace) et cliquable.
    <button
      type="button"
      className={`home-photo gallery-tile${isVideo ? ' gallery-tile--video' : ''}`}
      onClick={() => onOpen?.(item)}
      aria-label={`Agrandir : ${item.title}`}
    >
      {/* --- Carte PHOTO : image classique --- */}
      {!isVideo && <img src={item.image} alt={item.title} loading="lazy" />}

      {/* --- Carte VIDÉO : on montre l'affiche + un bouton lecture au centre --- */}
      {isVideo && (
        <>
          <img src={item.image} alt={item.title} loading="lazy" />
          <span className="gallery-tile__play" aria-hidden="true">▶</span>
        </>
      )}

      {/* Voile sombre en bas pour que le texte reste lisible par-dessus l'image */}
      <span className="home-photo__shade" />

      {/* Titre + description affichés en bas de la tuile */}
      <span className="home-photo__label">
        <strong>{item.title}</strong>
        {item.description && <span>{item.description}</span>}
      </span>
    </button>
  );
}


