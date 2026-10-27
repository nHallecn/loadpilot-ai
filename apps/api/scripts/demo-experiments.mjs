const base = 'http://127.0.0.1:4000';
const token = process.env.LOADPILOT_DEMO_TOKEN;
if (!token) {
  console.error('LOADPILOT_DEMO_TOKEN must be set in this terminal environment.');
  process.exit(1);
}
const request = async (path, data) => {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(path + ' failed with HTTP ' + response.status + ': ' + JSON.stringify(body));
  return body;
};

let plan = {
  scenario: 'baseline',
  concurrency: 4,
  durationSeconds: 5,
  requestsPerSecond: 20,
  metricFocus: 'latency',
  hypothesis: 'Serialized work will cause higher latency than parallel work.',
};

if (process.argv.includes('--with-ai')) {
  const suggestion = await request('/ai/plan', {
    targetId: 'demo-api',
    objective: 'Propose a short, safe test for a deliberately slow and an optimized local demonstration API.',
  });
  plan = suggestion.plan;
  console.log('Model-proposed plan:', JSON.stringify(plan, null, 2));
}

const run = async (variant) => {
  const result = await request('/experiments/run', { targetId: 'demo-api', variant, plan });
  console.log(variant, 'run:', result.id,
    'p95:', result.metrics.latencyMs.p95 + ' ms',
    'observed throughput:', result.metrics.observedRps + ' req/s',
    'errors:', result.metrics.errorCount);
  return result;
};

const before = await run('slow');
const after = await run('optimized');
const pairs = [{ beforeRunId: before.id, afterRunId: after.id }];
const comparison = await request('/experiments/compare', {
  beforeRunId: before.id,
  afterRunId: after.id,
});
console.log('Before/after observations:', JSON.stringify(comparison, null, 2));
console.log('Note: differences measured in an in-process demo are not proof of production performance.');

if (process.argv.includes('--diagnose')) {
  const report = await request('/ai/diagnose', {
    beforeRunId: before.id,
    afterRunId: after.id,
  });
  console.log('Evidence-backed AI diagnosis:', JSON.stringify(report, null, 2));
  console.log('WARNING: This diagnosis is a hypothesis, not causal proof.');
}

if (process.argv.includes('--repeat')) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  for (let pair = 2; pair <= 3; pair++) {
    console.log('Collecting confirmation pair', pair, 'of 3...');
    const nextBefore = await run('slow');
    const nextAfter = await run('optimized');
    pairs.push({ beforeRunId: nextBefore.id, afterRunId: nextAfter.id });
  }
  const report = await request('/experiments/adjudicate', { pairs });
  console.log('Descriptive repeat-trial verdict:', report.manifest.summary.verdict);
  console.log('Median measured p95 reduction:', report.manifest.summary.medianP95ReductionPercent, '%');
  console.log('Source-run SHA-256 checksum:', report.integrity.digest);
  mkdirSync('reports', { recursive: true });
  const output = 'reports/loadpilot-evidence-' + report.integrity.digest.slice(0, 12) + '.json';
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('Evidence JSON saved:', output);
  console.log('This checksum is not a digital signature. Three demo pairs do not prove statistical significance.');
}
