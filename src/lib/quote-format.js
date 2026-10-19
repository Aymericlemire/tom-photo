export function euroToCents(value) {
  const amount = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

// Convertit une ligne saisie dans l'éditeur (prix en euros) en ligne de devis (prix en centimes).
// Cette fonction est la seule source de vérité : affichage, aperçu PDF et enregistrement l'utilisent.
export function formItemToQuoteItem(item) {
  const quantity = Math.round(Number(item?.quantity));
  return {
    description: String(item?.description ?? '').trim(),
    quantity: Number.isFinite(quantity) && quantity >= 1 ? Math.min(quantity, 1000) : 1,
    unit_price: euroToCents(item?.unit_price)
  };
}

export const quoteItemTotal = (item) => item.quantity * item.unit_price;
export const quoteTotalCents = (items) => items.reduce((sum, item) => sum + quoteItemTotal(item), 0);

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
