import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ExperimentRecord } from './service.js';

export const controlledRequestSchema = z.object({
  serializedRunId: z.string().uuid(),
  parallelSameWorkRunId: z.string().uuid(),
  parallelFastWorkRunId: z.string().uuid(),
}).strict();

export type ControlledRequest = z.infer<typeof controlledRequestSchema>;

type Lookup = { get(id: string): ExperimentRecord | undefined };

export type SingleFactorContrast = {
  hypothesis: 'serialization_overhead' | 'processing_delay';
  beforeVariant: 'slow' | 'parallel_slow';
  afterVariant: 'parallel_slow' | 'optimized';
  changedFactor: 'serialized_to_parallel' | 'simulated_work_80ms_to_8ms';
  heldConstant: string[];
  beforeRunId: string;
  afterRunId: string;
  beforeP95Ms: number;
  afterP95Ms: number;
  differenceMs: number;
  reductionPercent: number;
  beforeRequests: number;
  afterRequests: number;
  beforeErrorRatePercent: number;
  afterErrorRatePercent: number;
  signal: 'observed_at_demo_threshold' | 'not_observed_at_demo_threshold' | 'error_regression';
};

export type ControlledReport = {
  schemaVersion: 'loadpilot.isolated-factors.v1';
  targetId: 'demo-api';
  assessment: 'controlled_synthetic_contrasts_not_causal_proof';
  plan: ExperimentRecord['plan'];
  sourceRuns: ExperimentRecord[];
  contrasts: [SingleFactorContrast, SingleFactorContrast];
  conclusion: {
    classification:
      | 'both_signals_observed'
      | 'serialization_signal_only'
      | 'processing_delay_signal_only'
      | 'neither_signal_observed'
      | 'inconclusive_error_regression';
    interpretation: string;
    limitations: string[];
    threshold: { minimumAbsoluteMs: 10; minimumRelativePercent: 20; noErrorRateRegression: true };
  };
  integrity: {
    algorithm: 'sha256';
    digest: string;
    assurance: 'checksum_only_not_a_digital_signature';
  };
};

export type ControlledResult =
  | { ok: true; report: ControlledReport }
  | { ok: false; reason: 'missing_run' | 'incompatible_runs' };

function sameConfiguration(a: ExperimentRecord['plan'], b: ExperimentRecord['plan']) {
  return a.scenario === b.scenario &&
    a.concurrency === b.concurrency &&
    a.durationSeconds === b.durationSeconds &&
    a.requestsPerSecond === b.requestsPerSecond &&
    a.metricFocus === b.metricFocus;
}

function eligible(r: ExperimentRecord) {
  const m = r.metrics;
  return r.status === 'completed' &&
    r.targetId === 'demo-api' &&
    r.executionMode === 'in_process_fastify_inject' &&
    m.requestCount >= 10 &&
    m.successCount + m.errorCount === m.requestCount &&
    m.latencySamplesMs.length === m.requestCount &&
    [
      m.latencyMs.p95, m.observedRps, m.durationMs, m.errorRatePercent,
      ...m.latencySamplesMs,
    ].every(n => Number.isFinite(n) && n >= 0) &&
    m.latencyMs.p95 > 0 &&
    m.errorRatePercent <= 100;
}

const rounded = (x: number) => Math.round(x * 100) / 100;

function contrast(
  before: ExperimentRecord,
  after: ExperimentRecord,
  hypothesis: SingleFactorContrast['hypothesis'],
  changedFactor: SingleFactorContrast['changedFactor'],
  heldConstant: string[],
): SingleFactorContrast {
  const a = before.metrics.latencyMs.p95;
  const b = after.metrics.latencyMs.p95;
  const difference = rounded(a - b);
  const reduction = rounded(((a - b) / a) * 100);
  const errorsWorsened = after.metrics.errorRatePercent > before.metrics.errorRatePercent;
  const signal = errorsWorsened ? 'error_regression' :
    difference >= 10 && reduction >= 20
      ? 'observed_at_demo_threshold'
      : 'not_observed_at_demo_threshold';

  return {
    hypothesis,
    beforeVariant: before.variant as SingleFactorContrast['beforeVariant'],
    afterVariant: after.variant as SingleFactorContrast['afterVariant'],
    changedFactor,
    heldConstant,
    beforeRunId: before.id,
    afterRunId: after.id,
    beforeP95Ms: a,
    afterP95Ms: b,
    differenceMs: difference,
    reductionPercent: reduction,
    beforeRequests: before.metrics.requestCount,
    afterRequests: after.metrics.requestCount,
    beforeErrorRatePercent: before.metrics.errorRatePercent,
    afterErrorRatePercent: after.metrics.errorRatePercent,
    signal,
  };
}

/**
 * Controlled contrasts:
 *   slow (serialized, 80ms) -> parallel_slow (parallel, 80ms)
 *   parallel_slow (parallel, 80ms) -> optimized (parallel, 8ms)
 *
 * Each comparison changes only one configured synthetic factor. No model call,
 * arbitrary target, background job, or fresh experiment is run by this method.
 */
export function investigateControlledFactors(
  lookup: Lookup,
  ids: ControlledRequest,
): ControlledResult {
  const identifiers = Object.values(ids);
  if (new Set(identifiers).size !== 3) {
    return { ok: false, reason: 'incompatible_runs' };
  }
  const [serialized, parallelSame, parallelFast] = [
    lookup.get(ids.serializedRunId),
    lookup.get(ids.parallelSameWorkRunId),
    lookup.get(ids.parallelFastWorkRunId),
  ];

  if (!serialized || !parallelSame || !parallelFast) {
    return { ok: false, reason: 'missing_run' };
  }
  if (serialized.variant !== 'slow' ||
      parallelSame.variant !== 'parallel_slow' ||
      parallelFast.variant !== 'optimized' ||
      ![serialized, parallelSame, parallelFast].every(eligible) ||
      !sameConfiguration(serialized.plan, parallelSame.plan) ||
      !sameConfiguration(serialized.plan, parallelFast.plan) ||
      !(Date.parse(serialized.recordedAt) <= Date.parse(parallelSame.recordedAt) &&
        Date.parse(parallelSame.recordedAt) <= Date.parse(parallelFast.recordedAt))) {
    return { ok: false, reason: 'incompatible_runs' };
  }

  const serialization = contrast(
    serialized, parallelSame, 'serialization_overhead',
    'serialized_to_parallel',
    ['simulated_work_per_request=80ms', 'target=demo-api', 'test_configuration=identical'],
  );
  const processing = contrast(
    parallelSame, parallelFast, 'processing_delay',
    'simulated_work_80ms_to_8ms',
    ['execution_model=parallel', 'target=demo-api', 'test_configuration=identical'],
  );

  const a = serialization.signal === 'observed_at_demo_threshold';
  const b = processing.signal === 'observed_at_demo_threshold';
  const errorRegression = [serialization, processing].some(x => x.signal === 'error_regression');
  const classification: ControlledReport['conclusion']['classification'] = errorRegression ? 'inconclusive_error_regression' :
    a && b ? 'both_signals_observed' :
    a ? 'serialization_signal_only' :
    b ? 'processing_delay_signal_only' : 'neither_signal_observed';
  const interpretation = errorRegression
    ? 'At least one intervention increased error rate; do not claim a clean latency improvement.'
    : a && b
      ? 'Both isolated interventions met the predeclared demo threshold; both mechanisms contribute to the synthetic latency gap.'
      : a
        ? 'Only the serialization intervention met the demo threshold. The processing-delay effect was not established under this configuration.'
        : b
          ? 'Only the processing-delay intervention met the demo threshold. The serialization effect was not established under this configuration.'
          : 'Neither isolated intervention met the predeclared demo threshold; the recorded evidence does not resolve the hypotheses.';

  const core = {
    schemaVersion: 'loadpilot.isolated-factors.v1' as const,
    targetId: 'demo-api' as const,
    assessment: 'controlled_synthetic_contrasts_not_causal_proof' as const,
    plan: structuredClone(serialized.plan),
    sourceRuns: [serialized, parallelSame, parallelFast].map(r => structuredClone(r)),
    contrasts: [serialization, processing] as [SingleFactorContrast, SingleFactorContrast],
    conclusion: {
      classification,
      interpretation,
      limitations: [
        'Two one-factor contrasts identify configured effects only in this controlled synthetic demonstration.',
        'This single triplet is not a replicated or randomized controlled experiment; run order may introduce drift.',
        'Fastify.inject timings exclude external network and socket overhead; do not generalize to production.',
        'A positive threshold is a predeclared descriptive signal, not statistical significance.',
        'The checksum detects changes only when checked against a trusted digest; it is not an authenticated signature.',
      ],
      threshold: {
        minimumAbsoluteMs: 10 as const,
        minimumRelativePercent: 20 as const,
        noErrorRateRegression: true as const,
      },
    },
  };
  const digest = createHash('sha256').update(JSON.stringify(core)).digest('hex');
  return {
    ok: true,
    report: {
      ...core,
      integrity: {
        algorithm: 'sha256',
        digest,
        assurance: 'checksum_only_not_a_digital_signature',
      },
    },
  };
}
