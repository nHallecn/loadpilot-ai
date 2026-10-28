import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDemoTarget } from '../src/experiments/demo-target.js';
import { ExperimentService, type ExperimentRecord } from '../src/experiments/service.js';
import { investigateControlledFactors } from '../src/experiments/controlled-investigation.js';

const plan = {
  scenario: 'baseline' as const,
  concurrency: 4,
  durationSeconds: 5,
  requestsPerSecond: 20,
  metricFocus: 'latency' as const,
  hypothesis: 'Separate serialization delay from the duration of simulated work.',
};

function fixture(variant: ExperimentRecord['variant'], p95: number, index: number): ExperimentRecord {
  return {
    id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'),
    variant,
    targetId: 'demo-api',
    recordedAt: new Date(Date.UTC(2026, 9, 28, 12, 0, index)).toISOString(),
    plan: { ...plan },
    status: 'completed',
    executionMode: 'in_process_fastify_inject',
    metrics: {
      requestCount: 25,
      successCount: 25,
      errorCount: 0,
      errorRatePercent: 0,
      durationMs: 5000,
      observedRps: 5,
      latencyMs: { min: p95, p50: p95, p95, p99: p95, max: p95, mean: p95 },
      latencySamplesMs: Array(25).fill(p95),
    },
  };
}

function evaluate(a: number, b: number, c: number) {
  const before = fixture('slow', a, 1);
  const middle = fixture('parallel_slow', b, 2);
  const after = fixture('optimized', c, 3);
  const map = new Map([before, middle, after].map(record => [record.id, record]));
  const ids = { serializedRunId: before.id, parallelSameWorkRunId: middle.id, parallelFastWorkRunId: after.id };
  return { map, ids, value: investigateControlledFactors(map, ids) };
}

describe('controlled synthetic contrasts', () => {
  it('checks one changed configuration factor per contrast', () => {
    const result = evaluate(320, 81, 9).value;
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Missing report');
    expect(result.report.conclusion.classification).toBe('both_signals_observed');
    expect(result.report.contrasts).toHaveLength(2);
    expect(result.report.contrasts[0]).toMatchObject({
      hypothesis: 'serialization_overhead',
      beforeVariant: 'slow',
      afterVariant: 'parallel_slow',
      changedFactor: 'serialized_to_parallel',
      signal: 'observed_at_demo_threshold',
    });
    expect(result.report.contrasts[1]).toMatchObject({
      hypothesis: 'processing_delay',
      beforeVariant: 'parallel_slow',
      afterVariant: 'optimized',
      changedFactor: 'simulated_work_80ms_to_8ms',
      signal: 'observed_at_demo_threshold',
    });
    expect(result.report.sourceRuns).toHaveLength(3);
    expect(result.report.integrity.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('distinguishes serialization-only, processing-only and unresolved evidence', () => {
    const serializationOnly = evaluate(300, 10, 10).value;
    const processingOnly = evaluate(80, 82, 8).value;
    const neither = evaluate(100, 95, 92).value;
    expect(serializationOnly.ok && serializationOnly.report.conclusion.classification)
      .toBe('serialization_signal_only');
    expect(processingOnly.ok && processingOnly.report.conclusion.classification)
      .toBe('processing_delay_signal_only');
    expect(neither.ok && neither.report.conclusion.classification)
      .toBe('neither_signal_observed');
  });

  it('detects error-rate regression and refuses incompatible or misordered runs', () => {
    const { map, ids } = evaluate(320, 81, 9);
    const parallel = map.get(ids.parallelSameWorkRunId)!;
    parallel.metrics.errorCount = 5;
    parallel.metrics.successCount = 20;
    parallel.metrics.errorRatePercent = 20;
    const regression = investigateControlledFactors(map, ids);
    expect(regression.ok && regression.report.conclusion.classification)
      .toBe('inconclusive_error_regression');

    parallel.metrics.errorCount = 0;
    parallel.metrics.successCount = 25;
    parallel.metrics.errorRatePercent = 0;
    parallel.plan.concurrency = 8;
    expect(investigateControlledFactors(map, ids))
      .toEqual({ ok: false, reason: 'incompatible_runs' });
    parallel.plan.concurrency = 4;

    expect(investigateControlledFactors(map, {
      ...ids, parallelSameWorkRunId: ids.serializedRunId,
    })).toEqual({ ok: false, reason: 'incompatible_runs' });
    expect(investigateControlledFactors(map, {
      ...ids, parallelFastWorkRunId: '00000000-0000-4000-8000-000000000999',
    })).toEqual({ ok: false, reason: 'missing_run' });

    parallel.metrics.requestCount = 4;
    expect(investigateControlledFactors(map, ids))
      .toEqual({ ok: false, reason: 'incompatible_runs' });
  });

  it('does not let clients turn a controlled investigation into arbitrary HTTP load', async () => {
    const target = createDemoTarget();
    try {
      for (const variant of ['slow', 'parallel_slow', 'optimized'] as const) {
        const response = await target.inject({ method: 'GET', url: '/work', query: { variant } });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ ok: true, variant });
      }
    } finally {
      await target.close();
    }
  });
});

describe('controlled investigation protected API', () => {
  const experiments = new ExperimentService({ durationOverrideMs: 1350 });
  const app = buildApp({ demoToken: 'controlled-test-secret', experiments });
  afterAll(async () => app.close());

  it('requires auth, run ID structure and a fully measured matched triplet', async () => {
    const unauthorized = await app.inject({
      method: 'POST', url: '/investigations/controlled',
      payload: { serializedRunId: 'x', parallelSameWorkRunId: 'y', parallelFastWorkRunId: 'z' },
    });
    expect(unauthorized.statusCode).toBe(401);

    const invalid = await app.inject({
      method: 'POST', url: '/investigations/controlled',
      headers: { authorization: 'Bearer controlled-test-secret' },
      payload: { serializedRunId: 'x', parallelSameWorkRunId: 'y', parallelFastWorkRunId: 'z' },
    });
    expect(invalid.statusCode).toBe(400);

    const runs = [];
    for (const variant of ['slow', 'parallel_slow', 'optimized'] as const) {
      const response = await app.inject({
        method: 'POST', url: '/experiments/run',
        headers: { authorization: 'Bearer controlled-test-secret' },
        payload: { targetId: 'demo-api', variant, plan },
      });
      expect(response.statusCode).toBe(200);
      const run: ExperimentRecord = response.json();
      expect(run.status).toBe('completed');
      expect(run.metrics.requestCount).toBeGreaterThanOrEqual(10);
      runs.push(run);
    }

    const response = await app.inject({
      method: 'POST', url: '/investigations/controlled',
      headers: { authorization: 'Bearer controlled-test-secret' },
      payload: {
        serializedRunId: runs[0].id,
        parallelSameWorkRunId: runs[1].id,
        parallelFastWorkRunId: runs[2].id,
      },
    });
    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result.contrasts).toHaveLength(2);
    expect(result.conclusion.classification).toBe('both_signals_observed');
    expect(result.integrity.digest).toHaveLength(64);
  }, 15000);
});
