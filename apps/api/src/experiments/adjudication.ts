import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ExperimentRecord } from './service.js';

export const trialPairsSchema = z.object({
  pairs: z.array(z.object({
    beforeRunId: z.string().uuid(),
    afterRunId: z.string().uuid(),
  }).strict()).min(2).max(3),
}).strict();

export type TrialPair = z.infer<typeof trialPairsSchema>['pairs'][number];

type Lookup = { get(id: string): ExperimentRecord | undefined };

export type TrialObservation = {
  pairNumber: number;
  beforeRunId: string;
  afterRunId: string;
  beforeP95Ms: number;
  afterP95Ms: number;
  absoluteReductionMs: number;
  reductionPercent: number | null;
  beforeErrorRatePercent: number;
  afterErrorRatePercent: number;
  beforeRequests: number;
  afterRequests: number;
  meetsDemoThreshold: boolean;
};

export type AdjudicationVerdict =
  | 'insufficient_repeats'
  | 'consistent_demo_gap'
  | 'mixed_observations'
  | 'no_repeatable_gap';

export type EvidenceManifest = {
  schemaVersion: 'loadpilot.trial-evidence.v1';
  targetId: 'demo-api';
  executionMode: 'in_process_fastify_inject';
  assessment: 'descriptive_repeat_trials_not_statistical_significance';
  plan: ExperimentRecord['plan'];
  observations: TrialObservation[];
  /** A snapshot of every source measurement used by the report. */
  sourceRuns: ExperimentRecord[];
  summary: {
    verdict: AdjudicationVerdict;
    pairCount: number;
    improvedPairCount: number;
    medianP95ReductionPercent: number | null;
    minimumP95ReductionPercent: number | null;
    maximumP95ReductionPercent: number | null;
    threshold: { minimumAbsoluteMs: 10; minimumRelativePercent: 20; minRequestsPerRun: 10 };
    limitations: string[];
  };
};

export type EvidenceReport = {
  manifest: EvidenceManifest;
  integrity: {
    algorithm: 'sha256';
    canonicalization: 'JSON.stringify(manifest)';
    digest: string;
    assurance: 'checksum_only_not_a_digital_signature';
  };
};

export type AdjudicationResult =
  | { ok: true; report: EvidenceReport }
  | { ok: false; reason: 'missing_run' | 'incompatible_runs' };

const round = (value: number) => Math.round(value * 100) / 100;

function samePlan(a: ExperimentRecord['plan'], b: ExperimentRecord['plan']) {
  return a.scenario === b.scenario &&
    a.concurrency === b.concurrency &&
    a.durationSeconds === b.durationSeconds &&
    a.requestsPerSecond === b.requestsPerSecond &&
    a.metricFocus === b.metricFocus;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Pure deterministic adjudication of already-completed, same-config demo runs.
 * Does not execute experiments, make model calls, or claim statistical significance.
 */
export function adjudicateTrials(records: Lookup, pairs: TrialPair[]): AdjudicationResult {
  if (pairs.length < 2 || pairs.length > 3) {
    return { ok: false, reason: 'incompatible_runs' };
  }

  const seen = new Set<string>();
  const sourceRuns: ExperimentRecord[] = [];
  const observations: TrialObservation[] = [];
  let referencePlan: ExperimentRecord['plan'] | undefined;

  for (const [index, pair] of pairs.entries()) {
    if (!pair.beforeRunId || !pair.afterRunId ||
        seen.has(pair.beforeRunId) || seen.has(pair.afterRunId) ||
        pair.beforeRunId === pair.afterRunId) {
      return { ok: false, reason: 'incompatible_runs' };
    }
    seen.add(pair.beforeRunId);
    seen.add(pair.afterRunId);

    const before = records.get(pair.beforeRunId);
    const after = records.get(pair.afterRunId);
    if (!before || !after) return { ok: false, reason: 'missing_run' };

    if (
      before.status !== 'completed' || after.status !== 'completed' ||
      before.targetId !== 'demo-api' || after.targetId !== 'demo-api' ||
      before.variant !== 'slow' || after.variant !== 'optimized' ||
      before.executionMode !== 'in_process_fastify_inject' ||
      after.executionMode !== 'in_process_fastify_inject' ||
      !samePlan(before.plan, after.plan) ||
      (referencePlan !== undefined && !samePlan(referencePlan, before.plan)) ||
      before.metrics.requestCount < 10 || after.metrics.requestCount < 10 ||
      before.metrics.latencySamplesMs.length !== before.metrics.requestCount ||
      after.metrics.latencySamplesMs.length !== after.metrics.requestCount ||
      Date.parse(before.recordedAt) > Date.parse(after.recordedAt)
    ) return { ok: false, reason: 'incompatible_runs' };

    referencePlan ??= before.plan;
    const beforeP95 = before.metrics.latencyMs.p95;
    const afterP95 = after.metrics.latencyMs.p95;
    const values = [
      beforeP95, afterP95,
      before.metrics.errorRatePercent, after.metrics.errorRatePercent,
      before.metrics.observedRps, after.metrics.observedRps,
      ...before.metrics.latencySamplesMs, ...after.metrics.latencySamplesMs,
    ];
    if (values.some((value) => !Number.isFinite(value) || value < 0) ||
        beforeP95 <= 0) return { ok: false, reason: 'incompatible_runs' };

    const diff = beforeP95 - afterP95;
    const percent = round((diff / beforeP95) * 100);
    const eligible = diff >= 10 && percent >= 20 &&
      after.metrics.errorRatePercent <= before.metrics.errorRatePercent;

    observations.push({
      pairNumber: index + 1,
      beforeRunId: before.id,
      afterRunId: after.id,
      beforeP95Ms: beforeP95,
      afterP95Ms: afterP95,
      absoluteReductionMs: round(diff),
      reductionPercent: percent,
      beforeErrorRatePercent: before.metrics.errorRatePercent,
      afterErrorRatePercent: after.metrics.errorRatePercent,
      beforeRequests: before.metrics.requestCount,
      afterRequests: after.metrics.requestCount,
      meetsDemoThreshold: eligible,
    });
    // Deep copy prevents future mutations of service-owned records from affecting the report.
    sourceRuns.push(structuredClone(before), structuredClone(after));
  }

  const improvements = observations.filter((pair) => pair.meetsDemoThreshold).length;
  const reductions = observations.map((pair) => pair.reductionPercent!);
  const verdict: AdjudicationVerdict =
    pairs.length < 3 ? 'insufficient_repeats' :
    improvements === 3 ? 'consistent_demo_gap' :
    improvements === 0 ? 'no_repeatable_gap' :
    'mixed_observations';

  const manifest: EvidenceManifest = {
    schemaVersion: 'loadpilot.trial-evidence.v1',
    targetId: 'demo-api',
    executionMode: 'in_process_fastify_inject',
    assessment: 'descriptive_repeat_trials_not_statistical_significance',
    plan: structuredClone(referencePlan!),
    observations,
    sourceRuns,
    summary: {
      verdict,
      pairCount: pairs.length,
      improvedPairCount: improvements,
      medianP95ReductionPercent: round(median(reductions)),
      minimumP95ReductionPercent: Math.min(...reductions),
      maximumP95ReductionPercent: Math.max(...reductions),
      threshold: { minimumAbsoluteMs: 10, minimumRelativePercent: 20, minRequestsPerRun: 10 },
      limitations: [
        'Descriptive consistency over up to three paired runs is not statistical significance.',
        'The slow/optimized variants change both serialization and simulated duration; root-cause attribution is not possible.',
        'Fastify.inject omits network and socket overhead; findings do not generalize to production.',
        'The run order is fixed (slow then optimized), so drift and order effects are not controlled.',
        'A SHA-256 checksum detects changes when compared against a trusted digest; it is not authentication or a digital signature.',
      ],
    },
  };
  return {
    ok: true,
    report: {
      manifest,
      integrity: {
        algorithm: 'sha256',
        canonicalization: 'JSON.stringify(manifest)',
        digest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
        assurance: 'checksum_only_not_a_digital_signature',
      },
    },
  };
}
