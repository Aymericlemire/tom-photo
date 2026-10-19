export function galleryCategoryForHomeCard(item, gallery) {
  const title = item?.title?.trim().toLocaleLowerCase();
  if (!title || !Array.isArray(gallery?.categories)) return '';

  const exactCategory = gallery.categories.find(
    (category) => category.toLocaleLowerCase() === title
  );
  if (exactCategory) return exactCategory;

  const matchingCard = gallery.cards?.find((card) => (
    card.title?.trim().toLocaleLowerCase() === title
    || card.group?.trim().toLocaleLowerCase() === title
  ));
  return matchingCard?.category && gallery.categories.includes(matchingCard.category)
    ? matchingCard.category
    : '';
}
