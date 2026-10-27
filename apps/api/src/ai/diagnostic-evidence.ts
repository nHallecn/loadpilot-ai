import { z } from 'zod';
import { compareRequestSchema } from '../experiments/schemas.js';
import type { ExperimentService } from '../experiments/service.js';

export const diagnosisRequestSchema = compareRequestSchema;

export const evidenceKeys = [
  'before.request_count',
  'after.request_count',
  'before.p95_latency_ms',
  'after.p95_latency_ms',
  'before.error_rate_percent',
  'after.error_rate_percent',
  'before.observed_rps',
  'after.observed_rps',
  'comparison.p95_delta_ms',
  'comparison.p95_reduction_percent',
  'comparison.throughput_delta_rps',
] as const;

export const evidenceKeySchema = z.enum(evidenceKeys);
export type EvidenceKey = z.infer<typeof evidenceKeySchema>;

export const diagnosisOutputSchema = z.object({
  category: z.enum([
    'possible_serialization_bottleneck',
    'latency_gap_observed',
    'no_clear_latency_gap',
    'inconclusive',
  ]),
  confidence: z.enum(['low', 'medium']),
  explanation: z.string().trim().min(25).max(350),
  evidenceIds: z.array(evidenceKeySchema).min(2).max(6),
  nextExperiment: z.object({
    action: z.enum(['repeat_both', 'reduce_rate', 'increase_concurrency']),
    reason: z.string().trim().min(20).max(240),
  }).strict(),
}).strict();

export type DiagnosisOutput = z.infer<typeof diagnosisOutputSchema>;

export const diagnosisJsonSchema = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['possible_serialization_bottleneck', 'latency_gap_observed', 'no_clear_latency_gap', 'inconclusive'] },
    confidence: { type: 'string', enum: ['low', 'medium'] },
    explanation: { type: 'string' },
    evidenceIds: { type: 'array', items: { type: 'string', enum: evidenceKeys }, minItems: 2, maxItems: 6 },
    nextExperiment: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['repeat_both', 'reduce_rate', 'increase_concurrency'] },
        reason: { type: 'string' },
      },
      required: ['action', 'reason'],
      additionalProperties: false,
    },
  },
  required: ['category', 'confidence', 'explanation', 'evidenceIds', 'nextExperiment'],
  additionalProperties: false,
} as const;

export type Evidence = {
  id: EvidenceKey;
  value: number;
  unit: 'count' | 'ms' | 'percent' | 'req/s';
};

export type DiagnosisManifest = {
  schemaVersion: 'loadpilot.diagnosis.v1';
  beforeRunId: string;
  afterRunId: string;
  context: {
    targetId: 'demo-api';
    beforeVariant: 'slow';
    afterVariant: 'optimized';
    executionMode: 'in_process_fastify_inject';
    sameTestConfiguration: true;
    /** These variants differ in both scheduling and simulated work duration. */
    multipleVariablesChanged: true;
  };
  evidence: Evidence[];
};

export type EvidencePreparation =
  | { ok: true; manifest: DiagnosisManifest }
  | { ok: false; reason: 'not_found' | 'incompatible_runs' };

function sameConfig(
  a: { scenario: string; concurrency: number; durationSeconds: number; requestsPerSecond: number; metricFocus: string },
  b: { scenario: string; concurrency: number; durationSeconds: number; requestsPerSecond: number; metricFocus: string },
) {
  return a.scenario === b.scenario &&
    a.concurrency === b.concurrency &&
    a.durationSeconds === b.durationSeconds &&
    a.requestsPerSecond === b.requestsPerSecond &&
    a.metricFocus === b.metricFocus;
}

/** Derive every value from stored numeric measurements. Never trust model-supplied metrics. */
export function prepareEvidence(
  experiments: ExperimentService,
  beforeRunId: string,
  afterRunId: string,
): EvidencePreparation {
  const before = experiments.get(beforeRunId);
  const after = experiments.get(afterRunId);
  if (!before || !after) return { ok: false, reason: 'not_found' };

  if (beforeRunId === afterRunId ||
      before.status !== 'completed' || after.status !== 'completed' ||
      before.targetId !== 'demo-api' || after.targetId !== 'demo-api' ||
      before.variant !== 'slow' || after.variant !== 'optimized' ||
      !sameConfig(before.plan, after.plan) ||
      before.metrics.requestCount < 5 || after.metrics.requestCount < 5) {
    return { ok: false, reason: 'incompatible_runs' };
  }

  const comparison = experiments.compare(beforeRunId, afterRunId);
  if (!comparison) return { ok: false, reason: 'incompatible_runs' };

  const data: Evidence[] = [
    { id: 'before.request_count', value: before.metrics.requestCount, unit: 'count' },
    { id: 'after.request_count', value: after.metrics.requestCount, unit: 'count' },
    { id: 'before.p95_latency_ms', value: before.metrics.latencyMs.p95, unit: 'ms' },
    { id: 'after.p95_latency_ms', value: after.metrics.latencyMs.p95, unit: 'ms' },
    { id: 'before.error_rate_percent', value: before.metrics.errorRatePercent, unit: 'percent' },
    { id: 'after.error_rate_percent', value: after.metrics.errorRatePercent, unit: 'percent' },
    { id: 'before.observed_rps', value: before.metrics.observedRps, unit: 'req/s' },
    { id: 'after.observed_rps', value: after.metrics.observedRps, unit: 'req/s' },
    { id: 'comparison.p95_delta_ms', value: comparison.p95DeltaMs, unit: 'ms' },
    { id: 'comparison.throughput_delta_rps', value: comparison.throughputDeltaRps, unit: 'req/s' },
  ];
  if (comparison.p95ReductionPercent !== null) {
    data.push({
      id: 'comparison.p95_reduction_percent',
      value: comparison.p95ReductionPercent,
      unit: 'percent',
    });
  }

  if (data.some((point) => !Number.isFinite(point.value))) {
    return { ok: false, reason: 'incompatible_runs' };
  }

  return {
    ok: true,
    manifest: {
      schemaVersion: 'loadpilot.diagnosis.v1',
      beforeRunId,
      afterRunId,
      context: {
        targetId: 'demo-api',
        beforeVariant: 'slow',
        afterVariant: 'optimized',
        executionMode: 'in_process_fastify_inject',
        sameTestConfiguration: true,
        multipleVariablesChanged: true,
      },
      evidence: data,
    },
  };
}

/** Deterministic oracle: reject model claims that the actual numbers cannot justify. */
export function verifyDiagnosis(manifest: DiagnosisManifest, proposed: DiagnosisOutput): boolean {
  const ids = proposed.evidenceIds;
  const referenced = new Set(ids);
  const values = new Map(manifest.evidence.map(({ id, value }) => [id, value]));
  if (referenced.size !== ids.length || ids.some((id) => !values.has(id))) return false;
  if (!referenced.has('before.p95_latency_ms') || !referenced.has('after.p95_latency_ms')) return false;

  const before = values.get('before.p95_latency_ms')!;
  const after = values.get('after.p95_latency_ms')!;
  const sampleMin = Math.min(
    values.get('before.request_count') ?? 0,
    values.get('after.request_count') ?? 0,
  );
  const largeGap = before - after >= 10 && (before - after) / Math.max(before, 0.01) >= 0.20;
  const smallGap = Math.abs(before - after) < 10 ||
    Math.abs(before - after) / Math.max(before, 0.01) < 0.10;

  if (proposed.category === 'possible_serialization_bottleneck' &&
      (!largeGap || sampleMin < 10)) return false;
  if (proposed.category === 'latency_gap_observed' && Math.abs(before - after) < 5) return false;
  if (proposed.category === 'no_clear_latency_gap' && !smallGap) return false;
  if (proposed.confidence === 'medium' && (!largeGap || sampleMin < 10)) return false;

  return true;
}
