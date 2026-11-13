/**
 * Verified-example candidate only. This is not a model response.
 * The model is required to independently generate a replacement for real use.
 */
export function rankProducts(products, query) {
  const q = query.trim().toLowerCase();
  return products.map((item) => {
    const text = (item.title + ' ' + item.category).toLowerCase();
    return {
      id: item.id,
      score: (text.includes(q) ? 100 : 0) + Math.round(item.rating * 10),
    };
  }).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 15);
}
