import { z } from 'zod';
import { testPlanSchema, type TestPlan } from './schemas.js';
import type { ControlledReport, SingleFactorContrast } from '../experiments/controlled-investigation.js';
import type { ExperimentRecord } from '../experiments/service.js';

export const hypothesisIds = ['serialization_overhead', 'processing_delay'] as const;
export const evidenceIds = [
  'serialization.before_p95_ms', 'serialization.after_p95_ms',
  'serialization.before_requests', 'serialization.after_requests',
  'serialization.before_error_percent', 'serialization.after_error_percent',
  'processing.before_p95_ms', 'processing.after_p95_ms',
  'processing.before_requests', 'processing.after_requests',
  'processing.before_error_percent', 'processing.after_error_percent',
] as const;

const hypothesisSchema = z.enum(hypothesisIds);
const signalSchema = z.enum(['observed_at_demo_threshold', 'not_observed_at_demo_threshold', 'error_regression']);
const evidenceIdSchema = z.enum(evidenceIds);
export const followUpActionSchema = z.enum([
  'probe_serialization_high_load', 'repeat_serialization', 'repeat_processing',
]);
export type FollowUpAction = z.infer<typeof followUpActionSchema>;

export const proposalSchema = z.object({
  hypothesis: hypothesisSchema,
  initialSignal: signalSchema,
  evidenceIds: z.array(evidenceIdSchema).min(2).max(6),
  rationale: z.string().trim().min(28).max(320),
  followUpAction: followUpActionSchema,
  whyThisTest: z.string().trim().min(28).max(260),
}).strict();
export type HypothesisProposal = z.infer<typeof proposalSchema>;

export const verdictSchema = z.enum([
  'replicated_signal', 'load_dependent_signal_observed',
  'inconsistent_signal', 'still_inconclusive',
]);

export const reassessmentSchema = z.object({
  verdict: verdictSchema,
  evidenceIds: z.array(z.enum([
    'initial.before_p95_ms', 'initial.after_p95_ms',
    'followup.before_p95_ms', 'followup.after_p95_ms',
    'initial.before_requests', 'initial.after_requests',
    'followup.before_requests', 'followup.after_requests',
  ])).min(4).max(8),
  explanation: z.string().trim().min(35).max(380),
  nextStep: z.string().trim().min(22).max(240),
}).strict();
export type HypothesisReassessment = z.infer<typeof reassessmentSchema>;

export const proposeRequestSchema = z.object({
  serializedRunId: z.string().uuid(),
  parallelSameWorkRunId: z.string().uuid(),
  parallelFastWorkRunId: z.string().uuid(),
}).strict();

export const reassessRequestSchema = z.object({
  investigationId: z.string().uuid(),
  followUpBeforeRunId: z.string().uuid(),
  followUpAfterRunId: z.string().uuid(),
}).strict();

export type InitialEvidence = {
  schemaVersion: 'loadpilot.hypotheses.initial.v1';
  runIds: [string, string, string];
  load: Pick<TestPlan,'concurrency'|'requestsPerSecond'|'durationSeconds'>;
  hypotheses: Array<{
    id: 'serialization_overhead' | 'processing_delay';
    signal: SingleFactorContrast['signal'];
    beforeP95Ms: number;
    afterP95Ms: number;
    beforeRequests: number;
    afterRequests: number;
    beforeErrorPercent: number;
    afterErrorPercent: number;
  }>;
};

export type FollowUpEvidence = {
  schemaVersion: 'loadpilot.hypotheses.followup.v1';
  hypothesis: HypothesisProposal['hypothesis'];
  action: FollowUpAction;
  initial: {
    signal: SingleFactorContrast['signal'];
    beforeP95Ms: number;
    afterP95Ms: number;
    beforeRequests: number;
    afterRequests: number;
  };
  followup: {
    signal: SingleFactorContrast['signal'];
    beforeP95Ms: number;
    afterP95Ms: number;
    beforeRequests: number;
    afterRequests: number;
  };
  load: {
    initialConcurrency: number;
    initialRps: number;
    followupConcurrency: number;
    followupRps: number;
  };
  expectedVerdict: z.infer<typeof verdictSchema>;
};

export function initialEvidence(report: ControlledReport): InitialEvidence {
  return {
    schemaVersion: 'loadpilot.hypotheses.initial.v1',
    runIds: report.sourceRuns.map(run => run.id) as [string, string, string],
    load: {
      concurrency: report.plan.concurrency,
      requestsPerSecond: report.plan.requestsPerSecond,
      durationSeconds: report.plan.durationSeconds,
    },
    hypotheses: report.contrasts.map(c => ({
      id: c.hypothesis,
      signal: c.signal,
      beforeP95Ms: c.beforeP95Ms,
      afterP95Ms: c.afterP95Ms,
      beforeRequests: c.beforeRequests,
      afterRequests: c.afterRequests,
      beforeErrorPercent: c.beforeErrorRatePercent,
      afterErrorPercent: c.afterErrorRatePercent,
    })),
  };
}

/** The LLM chooses from fixed actions; we derive every executable parameter. */
export function createFollowUp(
  report: ControlledReport,
  proposal: HypothesisProposal,
): { plan: TestPlan; variants: ['slow', 'parallel_slow'] | ['parallel_slow', 'optimized'] } | null {
  const signal = report.contrasts.find(c => c.hypothesis === proposal.hypothesis);
  if (!signal || proposal.initialSignal !== signal.signal) return null;
  if (proposal.followUpAction === 'repeat_processing' && proposal.hypothesis !== 'processing_delay') return null;
  if (proposal.followUpAction !== 'repeat_processing' && proposal.hypothesis !== 'serialization_overhead') return null;
  const highLoad = proposal.followUpAction === 'probe_serialization_high_load';
  if (highLoad && !(report.plan.concurrency <= 2 && report.plan.requestsPerSecond <= 10 &&
    signal.signal === 'not_observed_at_demo_threshold')) return null;

  const required = proposal.hypothesis === 'serialization_overhead'
    ? ['serialization.before_p95_ms', 'serialization.after_p95_ms']
    : ['processing.before_p95_ms', 'processing.after_p95_ms'];
  if (new Set(proposal.evidenceIds).size !== proposal.evidenceIds.length ||
      !required.every(id => proposal.evidenceIds.includes(id as typeof evidenceIds[number]))) return null;

  const plan = testPlanSchema.parse({
    ...report.plan,
    concurrency: highLoad ? 8 : report.plan.concurrency,
    requestsPerSecond: highLoad ? 30 : report.plan.requestsPerSecond,
    hypothesis: 'A user-authorized follow-up tests the selected synthetic performance explanation.',
  });
  return {
    plan,
    variants: proposal.hypothesis === 'serialization_overhead'
      ? ['slow', 'parallel_slow']
      : ['parallel_slow', 'optimized'],
  };
}

function contrastFromRuns(before: ExperimentRecord, after: ExperimentRecord): SingleFactorContrast['signal'] {
  const difference = before.metrics.latencyMs.p95 - after.metrics.latencyMs.p95;
  const percentage = difference / Math.max(before.metrics.latencyMs.p95, 0.001) * 100;
  if (after.metrics.errorRatePercent > before.metrics.errorRatePercent) return 'error_regression';
  return difference >= 10 && percentage >= 20 ? 'observed_at_demo_threshold' : 'not_observed_at_demo_threshold';
}

export function followUpEvidence(
  original: ControlledReport,
  selected: HypothesisProposal,
  action: FollowUpAction,
  plan: TestPlan,
  before: ExperimentRecord,
  after: ExperimentRecord,
): FollowUpEvidence | null {
  const current = original.contrasts.find(c => c.hypothesis === selected.hypothesis);
  const executable = createFollowUp(original, selected);
  if (!current || !executable || executable.variants[0] !== before.variant ||
      executable.variants[1] !== after.variant ||
      before.status !== 'completed' || after.status !== 'completed' ||
      before.targetId !== 'demo-api' || after.targetId !== 'demo-api' ||
      before.executionMode !== 'in_process_fastify_inject' ||
      after.executionMode !== 'in_process_fastify_inject' ||
      before.id === after.id ||
      original.sourceRuns.some(r => r.id === before.id || r.id === after.id) ||
      Date.parse(before.recordedAt) > Date.parse(after.recordedAt) ||
      Date.parse(before.recordedAt) < Date.parse(original.sourceRuns[2].recordedAt) ||
      before.metrics.requestCount < 10 || after.metrics.requestCount < 10 ||
      before.metrics.latencySamplesMs.length !== before.metrics.requestCount ||
      after.metrics.latencySamplesMs.length !== after.metrics.requestCount ||
      [before,after].some(r => !Number.isFinite(r.metrics.latencyMs.p95) ||
        r.metrics.latencyMs.p95 <= 0 || !Number.isFinite(r.metrics.errorRatePercent)) ||
      !testPlanSchema.safeParse(before.plan).success ||
      !testPlanSchema.safeParse(after.plan).success ||
      action !== selected.followUpAction) return null;
  const keys: Array<keyof TestPlan> = ['scenario', 'concurrency','requestsPerSecond','durationSeconds','metricFocus','hypothesis'];
  if (keys.some(key => before.plan[key] !== plan[key] || after.plan[key] !== plan[key])) return null;

  const signal = contrastFromRuns(before, after);
  const initialSignal = current.signal;
  const expectedVerdict: FollowUpEvidence['expectedVerdict'] =
    signal === 'error_regression' || initialSignal === 'error_regression'
      ? 'still_inconclusive'
      : initialSignal === 'observed_at_demo_threshold' && signal === 'observed_at_demo_threshold'
        ? 'replicated_signal'
        : initialSignal === 'not_observed_at_demo_threshold' && signal === 'observed_at_demo_threshold' &&
          action === 'probe_serialization_high_load'
          ? 'load_dependent_signal_observed'
          : initialSignal !== signal ? 'inconsistent_signal' : 'still_inconclusive';

  return {
    schemaVersion: 'loadpilot.hypotheses.followup.v1',
    hypothesis: selected.hypothesis, action,
    initial: {
      signal: initialSignal, beforeP95Ms: current.beforeP95Ms, afterP95Ms: current.afterP95Ms,
      beforeRequests: current.beforeRequests, afterRequests: current.afterRequests,
    },
    followup: {
      signal,
      beforeP95Ms: before.metrics.latencyMs.p95, afterP95Ms: after.metrics.latencyMs.p95,
      beforeRequests: before.metrics.requestCount, afterRequests: after.metrics.requestCount,
    },
    load: {
      initialConcurrency: original.plan.concurrency,
      initialRps: original.plan.requestsPerSecond,
      followupConcurrency: plan.concurrency,
      followupRps: plan.requestsPerSecond,
    },
    expectedVerdict,
  };
}

export function verifyReassessment(
  evidence: FollowUpEvidence,
  proposed: HypothesisReassessment,
): boolean {
  const citations = new Set(proposed.evidenceIds);
  return citations.size === proposed.evidenceIds.length &&
    proposed.verdict === evidence.expectedVerdict &&
    [
      'initial.before_p95_ms', 'initial.after_p95_ms',
      'followup.before_p95_ms', 'followup.after_p95_ms',
    ].every(id => citations.has(id as typeof proposed.evidenceIds[number]));
}
