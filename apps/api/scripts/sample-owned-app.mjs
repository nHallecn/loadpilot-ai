/**
 * A genuine loopback HTTP application to practice testing before connecting
 * your own app. Not an in-process Fastify.inject benchmark.
 *
 * From repository root:
 *   node apps/api/scripts/sample-owned-app.mjs
 *
 * For a manual before/after experiment, stop and restart with:
 *   SHOP_QUERY_MODE=cached node apps/api/scripts/sample-owned-app.mjs
 * Keep LoadPilot's Fastify server running so measured history survives.
 */
import { createServer } from 'node:http';

const mode = process.env.SHOP_QUERY_MODE === 'cached' ? 'cached' : 'uncached';
const products = Array.from({ length: 7800 }, (_, id) => ({
  id: id + 1,
  category: id % 5 === 0 ? 'hardware' : id % 4 === 0 ? 'software' : 'accessories',
  price: 10 + ((id * 137) % 375),
  stock: (id * 73) % 130,
}));
function rank(item) {
  // Actual synchronous CPU work per record; nothing sleeps.
  let score = item.price * 13 + item.stock;
  for (let n = 0; n < 110; n++) {
    score = (score * 17 + item.id * 31 + n) % 1000003;
  }
  return score;
}
function queryProducts() {
  return products
    .filter(p => p.stock > 0)
    .map(p => ({ ...p, score: rank(p) }))
    .sort((a,b) => a.score - b.score)
    .slice(0, 12);
}
const cached = mode === 'cached' ? queryProducts() : null;

const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET' || request.url !== '/api/products') {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  const result = cached ?? queryProducts();
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({
    products: result,
    totalCatalogItems: products.length,
    resultCount: result.length,
    mode,
  }));
});
server.listen(4100, '127.0.0.1', () => {
  console.log('Local example Shop API: http://127.0.0.1:4100/api/products');
  console.log('Current query mode:', mode, '(uncached recomputes ranking per request; cached reuses precomputed results)');
  console.log('Only local GET requests are accepted. Stop with Ctrl+C.');
});
