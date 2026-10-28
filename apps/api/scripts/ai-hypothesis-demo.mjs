/**
 * Opt-in interactive end-to-end AI investigation for the fixed local demo API.
 *
 * 1. Run three low-traffic variants and call Muse Spark for a hypothesis.
 * 2. Print the proposed follow-up plan.
 * 3. Require the user's explicit RUN approval before any follow-up traffic.
 * 4. Run the two approved variants, then explicitly request model reassessment.
 *
 * This command performs two paid Meta requests. Only demo-api is supported.
 * From apps/api with Fastify running: node --env-file=.env scripts/ai-hypothesis-demo.mjs
 */
import { createInterface } from 'node:readline/promises';

const token = process.env.LOADPILOT_DEMO_TOKEN;
if (!token) {
  console.error('Missing private LOADPILOT_DEMO_TOKEN.');
  process.exit(1);
}
const base = 'http://127.0.0.1:4000';
const plan = {
  scenario: 'baseline',
  concurrency: 1,
  durationSeconds: 5,
  requestsPerSecond: 5,
  metricFocus: 'latency',
  hypothesis: 'Low traffic may conceal serialization overhead; investigate a high-load follow-up.',
};

async function request(path, payload) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(path + ' HTTP ' + response.status + ': ' + JSON.stringify(data));
  return data;
}

async function run(variant, configuration) {
  const result = await request('/experiments/run', {
    targetId: 'demo-api', variant, plan: configuration,
  });
  if (result.status !== 'completed') throw new Error('Experiment cancelled');
  console.log(variant, 'p95 =', result.metrics.latencyMs.p95, 'ms', 'n =', result.metrics.requestCount);
  return result;
}

console.log('LoadPilot AI — competing hypotheses; this script incurs paid Muse Spark requests.');
console.log('All traffic is confined to a private in-process demo target, never user URLs.');
const [slow, control, optimized] = [
  await run('slow', plan),
  await run('parallel_slow', plan),
  await run('optimized', plan),
];
const evidence = await request('/investigations/controlled', {
  serializedRunId: slow.id,
  parallelSameWorkRunId: control.id,
  parallelFastWorkRunId: optimized.id,
});
console.log('Initial deterministic classification:', evidence.conclusion.classification);
const suggestion = await request('/ai/hypotheses', {
  serializedRunId: slow.id,
  parallelSameWorkRunId: control.id,
  parallelFastWorkRunId: optimized.id,
});
console.log('Muse selected hypothesis:', suggestion.hypothesis.hypothesis);
console.log('Evidence-citing rationale:', suggestion.hypothesis.rationale);
console.log('Proposed follow-up:', suggestion.hypothesis.followUpAction);
console.log('Why:', suggestion.hypothesis.whyThisTest);
console.log('Two private variants:', suggestion.followUp.variants.join(' → '));
console.log('Executable plan (server-constrained):', JSON.stringify(suggestion.followUp.plan, null, 2));

const prompt = createInterface({ input: process.stdin, output: process.stdout });
let answer = '';
try {
  answer = await prompt.question('Type RUN to approve TWO bounded local experiments and ONE further paid Muse reassessment: ');
} finally {
  prompt.close();
}
if (answer.trim() !== 'RUN') {
  console.log('Follow-up not authorized. No follow-up experiments or reassessment performed.');
  process.exit(0);
}
const results = [];
for (const variant of suggestion.followUp.variants) {
  results.push(await run(variant, suggestion.followUp.plan));
}
const review = await request('/ai/reassess', {
  investigationId: suggestion.investigationId,
  followUpBeforeRunId: results[0].id,
  followUpAfterRunId: results[1].id,
});
console.log('Initial signal:', review.initialSignal);
console.log('Follow-up signal:', review.followUpSignal);
console.log('Evidence-gated verdict:', review.assessment.verdict);
console.log('Meta explanation:', review.assessment.explanation);
console.log('Numerical citations:', JSON.stringify(review.citedEvidence, null, 2));
console.log('No statistical or production causal proof is claimed.');
