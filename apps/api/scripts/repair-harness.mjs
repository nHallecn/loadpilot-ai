/**
 * Executed ONLY inside the Docker verification sandbox by repair-agent.mjs.
 * No model, no network, no project access beyond the read-only mounted files.
 */
import { performance } from 'node:perf_hooks';

const tests = [
  { seed: 13, length: 1200, query: 'phone' },
  { seed: 42, length: 1800, query: 'CAMERA' },
  { seed: 97, length: 2400, query: ' gadget ' },
];

function products(seed, count) {
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const words = ['phone', 'camera', 'gadget', 'speaker', 'tablet', 'laptop', 'charger'];
  const categories = ['electronics', 'accessories', 'phone', 'gadget', 'audio'];
  return Array.from({ length: count }, (_, i) => Object.freeze({
    id: i + 1,
    title: words[Math.floor(rand() * words.length)] + ' ' + words[Math.floor(rand() * words.length)],
    category: categories[Math.floor(rand() * categories.length)],
    rating: Math.floor(rand() * 51) / 10,
  }));
}
function oracle(items, query) {
  const term = query.trim().toLowerCase();
  return items.map(item => {
    const normalized = (item.title + ' ' + item.category).toLowerCase();
    return { id: item.id, score: (normalized.includes(term) ? 100 : 0) + Math.round(item.rating * 10) };
  }).sort((a,b) => b.score-a.score || a.id-b.id).slice(0,15);
}
function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
function median(values) {
  const v = [...values].sort((a,b) => a-b);
  return v[Math.floor(v.length / 2)];
}
async function go() {
  const baseline = (await import('./baseline.mjs')).rankProducts;
  const candidate = (await import('./candidate.mjs')).rankProducts;
  if (typeof baseline !== 'function' || typeof candidate !== 'function') {
    throw new Error('Both modules must export rankProducts');
  }

  // Hidden correctness cases are independent of the model prompt and baseline.
  const cases = [
    ...tests,
    { seed: 21, length: 1, query: '' },
    { seed: 8, length: 71, query: 'NOTFOUND' },
    { seed: 99, length: 410, query: ' phone ' },
    { seed: 1234, length: 1200, query: 'speaker' },
  ];
  for (const test of cases) {
    const data = Object.freeze(products(test.seed, test.length));
    const expected = oracle(data, test.query);
    if (!same(baseline(data,test.query), expected)) throw new Error('Internal baseline disagrees with oracle');
    const actual = candidate(data,test.query);
    if (!same(actual,expected)) {
      process.stdout.write(JSON.stringify({
        status:'rejected',reason:'correctness_mismatch',
        case:{ seed:test.seed, items:test.length, query:test.query },testedCases:cases.length,
      }));
      return;
    }
  }

  const samples = [];
  for (const test of tests) {
    const data = Object.freeze(products(test.seed, test.length));
    // Warm both modules so the measured trials are more comparable.
    for (let warm=0; warm<3; warm++) {
      baseline(data,test.query); candidate(data,test.query);
    }
    const before = [], after = [];
    for (let turn=0; turn<11; turn++) {
      // Alternate execution order to mitigate warm-cache/JIT order effects.
      for (const [name,fn] of (turn % 2
        ? [['candidate',candidate],['baseline',baseline]]
        : [['baseline',baseline],['candidate',candidate]])) {
        const t0 = performance.now();
        for (let n=0;n<3;n++) fn(data,test.query);
        const ms = (performance.now() - t0)/3;
        (name === 'baseline' ? before : after).push(ms);
      }
    }
    const baselineMedianMs = median(before), candidateMedianMs = median(after);
    const gain = baselineMedianMs > 0 ? 100*(baselineMedianMs-candidateMedianMs)/baselineMedianMs : 0;
    samples.push({
      seed:test.seed,items:test.length,query:test.query,
      baselineMedianMs:Number(baselineMedianMs.toFixed(4)),
      candidateMedianMs:Number(candidateMedianMs.toFixed(4)),
      reductionPercent:Number(gain.toFixed(2)),
    });
  }
  // Correctness is mandatory, plus improvement in at least 2 of 3 scenarios.
  // This is not an HTTP benchmark, a confidence interval, or proof of causality.
  const wins = samples.filter(x => x.reductionPercent >= 20 && x.baselineMedianMs-x.candidateMedianMs >= 0.15).length;
  process.stdout.write(JSON.stringify({
    status:wins>=2?'accepted':'rejected',
    reason:wins>=2?'correctness_and_cpu_improvement':'insufficient_cpu_improvement',
    testedCases:cases.length, improvedCases:wins,
    samples,
    caveat:'Controlled local CPU microbenchmark; no production or statistically significant claim.',
  }));
}
try {
  await go();
} catch (error) {
  process.stdout.write(JSON.stringify({status:'rejected',reason:'exception',detail:String(error?.message || error).slice(0,240)}));
}
