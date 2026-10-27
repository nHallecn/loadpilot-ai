import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { adjudicateTrials } from '../src/experiments/adjudication.js';
import { ExperimentService, type ExperimentRecord } from '../src/experiments/service.js';

const plan = {
  scenario: 'baseline' as const,
  concurrency: 4,
  durationSeconds: 5,
  requestsPerSecond: 50,
  metricFocus: 'latency' as const,
  hypothesis: 'Repeated controlled trials should show a visible tail latency gap.',
};

function fakeRun(id: string, variant: 'slow' | 'optimized', p95: number): ExperimentRecord {
  return {
    id,
    targetId: 'demo-api',
    variant,
    status: 'completed',
    plan: { ...plan },
    recordedAt: variant === 'slow' ? '2026-10-27T12:00:00.000Z' : '2026-10-27T12:00:01.000Z',
    executionMode: 'in_process_fastify_inject',
    metrics: {
      requestCount: 20,
      successCount: 20,
      errorCount: 0,
      errorRatePercent: 0,
      durationMs: 1000,
      observedRps: 20,
      latencyMs: {
        min: p95, p50: p95, p95, p99: p95, max: p95, mean: p95,
      },
      latencySamplesMs: Array.from({ length: 20 }, () => p95),
    },
  };
}

function fixtures(afterValues: number[] = [10, 12, 14]) {
  const map = new Map<string, ExperimentRecord>();
  const pairs = afterValues.map((p95, index) => {
    const beforeRunId = 'before-' + index;
    const afterRunId = 'after-' + index;
    map.set(beforeRunId, fakeRun(beforeRunId, 'slow', 100));
    map.set(afterRunId, fakeRun(afterRunId, 'optimized', p95));
    return { beforeRunId, afterRunId };
  });
  return { lookup: { get: (id: string) => map.get(id) }, pairs, map };
}

describe('deterministic repeat-trial adjudication', () => {
  it('requires three independent pairs to report consistency and hashes source records', () => {
    const { lookup, pairs } = fixtures();
    const two = adjudicateTrials(lookup, pairs.slice(0, 2));
    expect(two.ok).toBe(true);
    if (!two.ok) throw new Error();
    expect(two.report.manifest.summary.verdict).toBe('insufficient_repeats');

    const three = adjudicateTrials(lookup, pairs);
    expect(three.ok).toBe(true);
    if (!three.ok) throw new Error();
    const { report } = three;
    expect(report.manifest.summary.verdict).toBe('consistent_demo_gap');
    expect(report.manifest.summary.improvedPairCount).toBe(3);
    expect(report.manifest.sourceRuns).toHaveLength(6);
    expect(report.manifest.summary.medianP95ReductionPercent).toBe(88);
    expect(report.integrity.digest).toBe(
      createHash('sha256').update(JSON.stringify(report.manifest)).digest('hex'),
    );
    expect(adjudicateTrials(lookup, pairs)).toEqual(three);
  });

  it('does not present mixed or regressing trials as consistent evidence', () => {
    const mixed = fixtures([12, 90, 9]);
    const report = adjudicateTrials(mixed.lookup, mixed.pairs);
    expect(report.ok).toBe(true);
    if (!report.ok) throw new Error();
    expect(report.report.manifest.summary.verdict).toBe('mixed_observations');

    const none = fixtures([99, 101, 96]);
    const noImprovement = adjudicateTrials(none.lookup, none.pairs);
    expect(noImprovement.ok).toBe(true);
    if (!noImprovement.ok) throw new Error();
    expect(noImprovement.report.manifest.summary.verdict).toBe('no_pairs_meet_threshold');
  });

  it('rejects duplicate, missing, cancelled, mismatched and undersampled records', () => {
    const { lookup, pairs, map } = fixtures();
    expect(adjudicateTrials(lookup, [pairs[0], pairs[0]])).toEqual({
      ok: false, reason: 'incompatible_runs',
    });
    expect(adjudicateTrials(lookup, [pairs[0], { ...pairs[1], afterRunId: 'missing' }]))
      .toEqual({ ok: false, reason: 'missing_run' });

    map.get('before-1')!.status = 'cancelled';
    expect(adjudicateTrials(lookup, pairs)).toEqual({ ok: false, reason: 'incompatible_runs' });
    map.get('before-1')!.status = 'completed';

    map.get('after-1')!.plan.concurrency = 15;
    expect(adjudicateTrials(lookup, pairs)).toEqual({ ok: false, reason: 'incompatible_runs' });
    map.get('after-1')!.plan.concurrency = 4;

    map.get('after-1')!.metrics.requestCount = 8;
    expect(adjudicateTrials(lookup, pairs)).toEqual({ ok: false, reason: 'incompatible_runs' });
  });

  it('treats increased error rate as failure to meet the demo threshold', () => {
    const { lookup, pairs, map } = fixtures();
    map.get('after-1')!.metrics.errorCount = 4;
    map.get('after-1')!.metrics.successCount = 16;
    map.get('after-1')!.metrics.errorRatePercent = 20;
    const result = adjudicateTrials(lookup, pairs);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.report.manifest.summary.improvedPairCount).toBe(2);
    expect(result.report.manifest.summary.verdict).toBe('mixed_observations');
  });
});

describe('protected trial adjudication API', () => {
  const experiments = new ExperimentService({ durationOverrideMs: 1450 });
  const app = buildApp({ demoToken: 'repeat-demo-test-secret', experiments });
  afterAll(async () => app.close());

  it('authenticates and independently validates the report inputs', async () => {
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/experiments/adjudicate',
      payload: { pairs: [] },
    });
    expect(unauthorized.statusCode).toBe(401);

    const bad = await app.inject({
      method: 'POST', url: '/experiments/adjudicate',
      headers: { authorization: 'Bearer repeat-demo-test-secret' },
      payload: { pairs: [{ beforeRunId: 'javascript:evil', afterRunId: 'http://bad' }] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('returns a measured report and detects expired/nonexistent records', async () => {
    const pairs = [];
    for (let i = 0; i < 2; i++) {
      const slow = await experiments.run({ targetId: 'demo-api', variant: 'slow', plan });
      const fast = await experiments.run({ targetId: 'demo-api', variant: 'optimized', plan });
      expect(slow?.status).toBe('completed');
      expect(fast?.status).toBe('completed');
      pairs.push({ beforeRunId: slow!.id, afterRunId: fast!.id });
    }

    const report = await app.inject({
      method: 'POST', url: '/experiments/adjudicate',
      headers: { authorization: 'Bearer repeat-demo-test-secret' },
      payload: { pairs },
    });
    expect(report.statusCode).toBe(200);
    const data = report.json();
    expect(data.manifest.summary.verdict).toBe('insufficient_repeats');
    expect(data.manifest.sourceRuns).toHaveLength(4);
    expect(data.integrity.digest).toHaveLength(64);

    const missing = await app.inject({
      method: 'POST', url: '/experiments/adjudicate',
      headers: { authorization: 'Bearer repeat-demo-test-secret' },
      payload: {
        pairs: [pairs[0], {
          ...pairs[1], afterRunId: '00000000-0000-4000-8000-000000000001',
        }],
      },
    });
    expect(missing.statusCode).toBe(404);
  }, 15000);
});
