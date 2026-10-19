// GalleryPage.jsx
// -----------------------------------------------------------------------------
// La page GALERIE (/galerie).
// Elle affiche les photos par catégorie (Portrait, Mariage, Drone et Vidéos…).
// À l'intérieur de chaque catégorie, les photos peuvent être regroupées en
// "sous-groupes" (ex. Portrait seul / Portrait duo / Portrait famille).
// Le visiteur peut tout voir ou filtrer par catégorie via les boutons.
// -----------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageIntro from '../components/PageIntro.jsx';
import GalleryCard from '../components/GalleryCard.jsx';
import Lightbox from '../components/Lightbox.jsx';

// -----------------------------------------------------------------------------
// buildSubSections : regroupe une liste de cartes par leur champ "group".
// On garde l'ordre d'apparition des groupes. Les cartes sans groupe (group "")
// sont mises ensemble dans une seule section sans titre.
// Retourne un tableau : [{ key, heading, cards }, ...]
// -----------------------------------------------------------------------------
function buildSubSections(cards) {
  const order = [];
  const groups = new Map();
  for (const card of cards) {
    const key = card.group || ''; // '' = pas de sous-groupe
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(card);
  }
  return order.map((key) => ({ key, heading: key, cards: groups.get(key) }));
}

export default function GalleryPage({ gallery }) {
  const safeGallery = gallery ?? { title: 'Galerie', intro: '', categories: [], cards: [] };

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCategory = searchParams.get('category') || '';
  const selectedCategory = safeGallery.categories.includes(requestedCategory) ? requestedCategory : '';
  const showAll = !selectedCategory;
  const [lightboxIndex, setLightboxIndex] = useState(null);

  function selectCategory(category) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (category) next.set('category', category);
      else next.delete('category');
      return next;
    }, { replace: true });
    setLightboxIndex(null);
  }

  const visibleCards = useMemo(() => {
    const cards = Array.isArray(safeGallery.cards) ? safeGallery.cards : [];
    return selectedCategory
      ? cards.filter((photo) => photo.category === selectedCategory)
      : cards;
  }, [safeGallery.cards, selectedCategory]);

  const categories = useMemo(() => {
    const cards = Array.isArray(safeGallery.cards) ? safeGallery.cards : [];
    const knownCategories = Array.isArray(safeGallery.categories) ? safeGallery.categories : [];

    if (!showAll) {
      return [{ category: selectedCategory, subSections: buildSubSections(visibleCards) }];
    }

    return knownCategories.map((category) => ({
      category,
      subSections: buildSubSections(cards.filter((photo) => photo.category === category))
    }));
  }, [safeGallery.cards, safeGallery.categories, selectedCategory, showAll, visibleCards]);

  const hasAnyCard = visibleCards.length > 0;
  // Si on a filtré UNE catégorie qui n'a qu'un seul groupe sans nom,
  // on évite d'afficher un titre de sous-section vide.
  const singleGroup = !showAll && categories[0]?.subSections.length === 1 && !categories[0].subSections[0].heading;

  // Ouvre la visionneuse sur le visuel cliqué : on retrouve sa position
  // dans la liste actuellement visible (pour que les flèches suivent l'ordre affiché).
  function openLightbox(item) {
    const index = visibleCards.findIndex((card) => card === item);
    setLightboxIndex(index < 0 ? 0 : index);
  }

  return (
    <>
      <PageIntro
        eyebrow="Un regard, plusieurs histoires"
        title={safeGallery.title}
        intro={safeGallery.intro}
      />
      <section className="section-wrap section-wrap--top">
        <nav className="gallery-filters" aria-label="Filtrer la galerie par catégorie">
          <button
            type="button"
            className={showAll ? 'is-active' : ''}
            aria-pressed={showAll}
            onClick={() => selectCategory('')}
          >
            Toutes les photos <span>{safeGallery.cards.length}</span>
          </button>
          {safeGallery.categories.map((category) => (
            <button
              type="button"
              className={selectedCategory === category ? 'is-active' : ''}
              aria-pressed={selectedCategory === category}
              key={category}
              onClick={() => selectCategory(category)}
            >
              {category} <span>{safeGallery.cards.filter((photo) => photo.category === category).length}</span>
            </button>
          ))}
        </nav>

        {/* Message si la catégorie choisie est vide */}
        {!hasAnyCard && <p className="gallery-empty">Aucune photo dans cette catégorie pour le moment.</p>}

        {/* Une section par catégorie… */}
        <div className="gallery-sections">
          {categories.map(({ category, subSections }) => (
            <section className="gallery-category" key={category} aria-label={category}>
              {/* Titre de la catégorie (visible uniquement en mode "Toutes") */}
              {showAll && <h2 className="gallery-category__title">{category}</h2>}

              {/* …et, dans chaque catégorie, une sous-section par groupe */}
              {subSections.map((sub) => (
                <div className="gallery-subsection" key={sub.key || 'all'}>
                  {/* Titre du sous-groupe (masqué s'il n'y en a qu'un et sans nom) */}
                  {sub.heading && !singleGroup && <h3 className="gallery-subsection__title">{sub.heading}</h3>}
                  <div className="photo-grid">
                    {sub.cards.map((item, index) => (
                      <GalleryCard key={`${item.image}-${index}`} item={item} onOpen={openLightbox} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </section>

      {/* 🔎 Visionneuse plein écran : affichée seulement si un visuel est ouvert */}
      {lightboxIndex !== null && (
        <Lightbox
          items={visibleCards}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
