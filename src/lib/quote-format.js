export function normalizeQuoteItems(items) {
  let parsedItems = items;
  if (typeof parsedItems === 'string') {
    try {
      parsedItems = JSON.parse(parsedItems);
    } catch {
      throw new Error('Les prestations du devis sont illisibles. Corrigez les lignes avant de modifier ou générer le PDF.');
    }
  }
  if (!Array.isArray(parsedItems)) {
    throw new Error('Les prestations du devis ne sont pas dans un format modifiable. Vérifiez les lignes du devis.');
  }

  return parsedItems.map((item, index) => {
    const description = item?.description ?? item?.label ?? item?.name ?? item?.title;
    const quantity = Number(item?.quantity ?? item?.qty ?? 1);
    const unitPrice = Number(item?.unit_price ?? item?.unitPrice ?? item?.price_cents ?? item?.price ?? item?.amount);
    if (typeof description !== 'string' || !description.trim() ||
        !Number.isSafeInteger(quantity) || quantity < 1 ||
        !Number.isSafeInteger(unitPrice) || unitPrice < 0) {
      throw new Error(`La ligne ${index + 1} du devis est incomplète ou invalide. Vérifiez sa description, sa quantité et son prix.`);
    }
    return { description: description.trim(), quantity, unit_price: unitPrice };
  });
}
