import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { ExperimentService } from '../src/experiments/service.js';
import { runBoundedExperiment } from '../src/experiments/runner.js';
import type { TestPlan } from '../src/ai/schemas.js';

const plan: TestPlan = {
  scenario: 'baseline',
  concurrency: 4,
  durationSeconds: 5,
  requestsPerSecond: 20,
  metricFocus: 'latency',
  hypothesis: 'The intentionally serialized handler will increase p95 latency.',
};

describe('bounded experiment runner', () => {
  it('caps request starts and reports genuine measurements', async () => {
    let calls = 0;
    const result = await runBoundedExperiment(
      plan,
      'optimized',
      async () => { calls++; return { statusCode: 200 }; },
      { durationOverrideMs: 175 },
    );
    expect(result.cancelled).toBe(false);
    expect(calls).toBeLessThanOrEqual(4);
    expect(result.metrics.requestCount).toBe(calls);
    expect(result.metrics.errorCount).toBe(0);
    expect(result.metrics.latencySamplesMs).toHaveLength(calls);
    expect(result.metrics.latencyMs.p95).toBeGreaterThanOrEqual(0);
  });

  it('tracks failed HTTP responses and bounded cancellation', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 70);
    const result = await runBoundedExperiment(
      { ...plan, requestsPerSecond: 50 },
      'optimized',
      async () => ({ statusCode: 500 }),
      { durationOverrideMs: 800, signal: controller.signal },
    );
    expect(result.cancelled).toBe(true);
    expect(result.metrics.requestCount).toBeGreaterThan(0);
    expect(result.metrics.errorCount).toBe(result.metrics.requestCount);
    expect(result.metrics.errorRatePercent).toBe(100);
  });
});

describe('authenticated experiment routes', () => {
  const app = buildApp({
    demoToken: 'run-test-secret',
    experiments: new ExperimentService({ durationOverrideMs: 350 }),
  });
  afterAll(async () => { await app.close(); });

  const runRequest = (variant: 'slow' | 'optimized', token = 'run-test-secret') =>
    app.inject({
      method: 'POST',
      url: '/experiments/run',
      headers: { authorization: 'Bearer ' + token },
      payload: { targetId: 'demo-api', variant, plan },
    });

  it('blocks unauthenticated requests and rejects external targets', async () => {
    expect((await app.inject({
      method: 'POST',
      url: '/experiments/run',
      payload: { targetId: 'demo-api', variant: 'slow', plan },
    })).statusCode).toBe(401);

    const badTarget = await app.inject({
      method: 'POST',
      url: '/experiments/run',
      headers: { authorization: 'Bearer run-test-secret' },
      payload: { targetId: 'https://example.com', variant: 'slow', plan },
    });
    expect(badTarget.statusCode).toBe(400);

    const badLimits = await app.inject({
      method: 'POST',
      url: '/experiments/run',
      headers: { authorization: 'Bearer run-test-secret' },
      payload: { targetId: 'demo-api', variant: 'slow', plan: { ...plan, concurrency: 10000 } },
    });
    expect(badLimits.statusCode).toBe(400);
  });

  it('measures actual bottleneck differences and compares completed runs', async () => {
    const slowResponse = await runRequest('slow');
    expect(slowResponse.statusCode).toBe(200);
    const slow = slowResponse.json();
    expect(slow.status).toBe('completed');
    expect(slow.executionMode).toBe('in_process_fastify_inject');
    expect(slow.metrics.requestCount).toBeGreaterThan(0);
    expect(slow.metrics.requestCount).toBeLessThanOrEqual(500);

    const fastResponse = await runRequest('optimized');
    expect(fastResponse.statusCode).toBe(200);
    const fast = fastResponse.json();
    expect(fast.status).toBe('completed');
    expect(slow.metrics.latencyMs.p95).toBeGreaterThan(fast.metrics.latencyMs.p95);

    const comparison = await app.inject({
      method: 'POST',
      url: '/experiments/compare',
      headers: { authorization: 'Bearer run-test-secret' },
      payload: { beforeRunId: slow.id, afterRunId: fast.id },
    });
    expect(comparison.statusCode).toBe(200);
    expect(comparison.json().p95ReductionPercent).toBeGreaterThan(0);
    expect(comparison.json().evidence).toBe('observed_measurements_not_causal_proof');

    const history = await app.inject({
      method: 'GET',
      url: '/experiments',
      headers: { authorization: 'Bearer run-test-secret' },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().runs.length).toBe(2);

    const detail = await app.inject({
      method: 'GET',
      url: '/experiments/' + fast.id,
      headers: { authorization: 'Bearer run-test-secret' },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().id).toBe(fast.id);
  });

  it('refuses comparisons of unknown runs', async () => {
    const unknown = await app.inject({
      method: 'POST',
      url: '/experiments/compare',
      headers: { authorization: 'Bearer run-test-secret' },
      payload: {
        beforeRunId: '00000000-0000-4000-8000-000000000001',
        afterRunId: '00000000-0000-4000-8000-000000000002',
      },
    });
    expect(unknown.statusCode).toBe(404);
  });
});
