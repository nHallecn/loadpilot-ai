/**
 * Run only the controlled three-variant local investigation.
 * No Meta API call or arbitrary host is allowed.
 *
 * From apps/api, with Fastify already running on 127.0.0.1:4000:
 *   node --env-file=.env scripts/controlled-investigation.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const token = process.env.LOADPILOT_DEMO_TOKEN;
if (!token) {
  console.error('Missing private LOADPILOT_DEMO_TOKEN environment variable.');
  process.exit(1);
}

const plan = {
  scenario: 'baseline',
  concurrency: 4,
  durationSeconds: 5,
  requestsPerSecond: 20,
  metricFocus: 'latency',
  hypothesis: 'Separate scheduling serialization from simulated handler work duration.',
};

const request = async (path, payload) => {
  const response = await fetch('http://127.0.0.1:4000' + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(path + ': HTTP ' + response.status + ' ' + JSON.stringify(result));
  return result;
};

const results = [];
for (const variant of ['slow', 'parallel_slow', 'optimized']) {
  const run = await request('/experiments/run', { targetId: 'demo-api', variant, plan });
  if (run.status !== 'completed') throw new Error(variant + ' was not completed');
  results.push(run);
  console.log(variant, 'p95', run.metrics.latencyMs.p95 + 'ms', 'requests', run.metrics.requestCount);
}

const report = await request('/investigations/controlled', {
  serializedRunId: results[0].id,
  parallelSameWorkRunId: results[1].id,
  parallelFastWorkRunId: results[2].id,
});

console.log('Deterministic classification:', report.conclusion.classification);
for (const contrast of report.contrasts) {
  console.log(contrast.hypothesis, contrast.signal, contrast.reductionPercent + '% p95 reduction');
}
console.log('No causal or production-performance claim is made.');
mkdirSync('reports', { recursive: true });
const path = 'reports/loadpilot-controlled-' + report.integrity.digest.slice(0, 12) + '.json';
writeFileSync(path, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log('Evidence saved to', path);
