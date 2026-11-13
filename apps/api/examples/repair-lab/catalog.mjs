/**
 * Owner-approved sample source for LoadPilot Repair Lab.
 * Intentionally recalculates every product's search score in the sorting
 * comparator, wasting CPU cycles on repeated normalization.
 * No network or external dependencies.
 */
export function rankProducts(products, query) {
  const q = query.trim().toLowerCase();
  const score = (item) => {
    const text = (item.title + ' ' + item.category).toLowerCase();
    return (text.includes(q) ? 100 : 0) + Math.round(item.rating * 10);
  };
  return [...products]
    .sort((a, b) => score(b) - score(a) || a.id - b.id)
    .slice(0, 15)
    .map((item) => ({ id: item.id, score: score(item) }));
}
