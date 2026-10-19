// gallery-migration.js
// -----------------------------------------------------------------------------
// Fait évoluer automatiquement une ANCIENNE galerie vers le nouveau format.
// Pour chaque photo existante, on s'assure que les nouveaux champs existent :
//   - category (catégorie), group (sous-groupe), type ("photo"/"video"), video
// Sans ça, une photo enregistrée avant la mise à jour n'aurait pas ces champs.
// -----------------------------------------------------------------------------
export function migrateGalleryCategories(existingGallery, migratedGallery, defaultGallery) {
  const existingCategories = Array.isArray(existingGallery?.categories)
    ? existingGallery.categories.filter(Boolean)
    : [];
  const cardCategories = (existingGallery?.cards || [])
    .map((photo) => photo.category || photo.title)
    .filter(Boolean);
  const categories = [...new Set(existingCategories.length
    ? [...existingCategories, ...cardCategories]
    : cardCategories)];
  const migratedCategories = categories.length ? categories : [...defaultGallery.categories];
  const cards = (migratedGallery.cards || []).map((photo) => ({
    ...photo,
    category: photo.category || photo.title || migratedCategories[0],
    group: photo.group || '',
    type: photo.type === 'video' ? 'video' : 'photo',
    video: photo.video || ''
  }));

  for (const photo of cards) {
    if (photo.category && !migratedCategories.includes(photo.category)) {
      migratedCategories.push(photo.category);
    }
  }

  return { ...migratedGallery, categories: migratedCategories, cards };
}
