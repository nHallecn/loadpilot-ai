export type TestPlan = {
  scenario: 'baseline' | 'spike';
  concurrency: number;
  durationSeconds: number;
  requestsPerSecond: number;
  metricFocus: 'latency' | 'throughput' | 'error_rate';
  hypothesis: string;
};

export type Metrics = {
  requestCount: number;
  successCount: number;
  errorCount: number;
  errorRatePercent: number;
  durationMs: number;
  observedRps: number;
  latencyMs: {
    min: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    mean: number;
  };
  latencySamplesMs: number[];
};

export type ExperimentRun = {
  id: string;
  targetId: 'demo-api';
  variant: 'slow' | 'parallel_slow' | 'optimized';
  plan: TestPlan;
  recordedAt: string;
  status: 'completed' | 'cancelled';
  metrics: Metrics;
  executionMode: 'in_process_fastify_inject';
};

export type Comparison = {
  beforeRunId: string;
  afterRunId: string;
  p95DeltaMs: number;
  p95ReductionPercent: number | null;
  throughputDeltaRps: number;
  beforeErrorRatePercent: number;
  afterErrorRatePercent: number;
  evidence: string;
};

export type Finding = {
  status: 'evidence_backed_hypothesis';
  model: string;
  beforeRunId: string;
  afterRunId: string;
  finding: {
    category: string;
    confidence: 'low' | 'medium';
    explanation: string;
    evidenceIds: string[];
  };
  citedEvidence: Array<{ id: string; value: number; unit: string }>;
  nextExperiment: {
    action: 'repeat_both' | 'reduce_rate' | 'increase_concurrency';
    reason: string;
    status: 'proposal_only';
  };
  caveats: string[];
  cached: boolean;
};

export type TrialPair = { beforeRunId: string; afterRunId: string };

export type TrialReport = {
  manifest: {
    schemaVersion: 'loadpilot.trial-evidence.v1';
    observations: Array<{
      pairNumber: number;
      beforeP95Ms: number;
      afterP95Ms: number;
      reductionPercent: number | null;
      beforeRequests: number;
      afterRequests: number;
      meetsDemoThreshold: boolean;
    }>;
    summary: {
      verdict: 'insufficient_repeats' | 'consistent_demo_gap' | 'mixed_observations' | 'no_pairs_meet_threshold';
      pairCount: number;
      improvedPairCount: number;
      medianP95ReductionPercent: number | null;
      minimumP95ReductionPercent: number | null;
      maximumP95ReductionPercent: number | null;
      limitations: string[];
    };
    sourceRuns: ExperimentRun[];
  };
  integrity: {
    algorithm: 'sha256';
    digest: string;
    canonicalization: string;
    assurance: string;
  };
};

export type ControlledReport = {
  schemaVersion: 'loadpilot.isolated-factors.v1';
  assessment: string;
  sourceRuns: ExperimentRun[];
  contrasts: Array<{
    hypothesis: 'serialization_overhead' | 'processing_delay';
    beforeP95Ms: number;
    afterP95Ms: number;
    differenceMs: number;
    reductionPercent: number;
    changedFactor: string;
    heldConstant: string[];
    beforeRequests: number;
    afterRequests: number;
    signal: 'observed_at_demo_threshold' | 'not_observed_at_demo_threshold' | 'error_regression';
  }>;
  conclusion: {
    classification: string;
    interpretation: string;
    limitations: string[];
  };
  integrity: { digest: string; assurance: string };
};

export type HypothesisSession = {
  investigationId: string;
  model: string;
  hypothesis: {
    hypothesis: 'serialization_overhead' | 'processing_delay';
    initialSignal: string;
    evidenceIds: string[];
    rationale: string;
    followUpAction: 'probe_serialization_high_load' | 'repeat_serialization' | 'repeat_processing';
    whyThisTest: string;
  };
  followUp: { plan: TestPlan; variants: ['slow','parallel_slow'] | ['parallel_slow','optimized']; status: 'proposal_only' };
  cached: boolean;
};

export type HypothesisReview = {
  status: 'followup_evaluated';
  model: string;
  initialSignal: string;
  followUpSignal: string;
  assessment: {
    verdict: 'replicated_signal' | 'load_dependent_signal_observed' | 'inconsistent_signal' | 'still_inconclusive';
    explanation: string;
    nextStep: string;
    evidenceIds: string[];
  };
  citedEvidence: Array<{id:string; value:number}>;
  load: {initialConcurrency:number; initialRps:number; followupConcurrency:number; followupRps:number};
  cached: boolean;
  limitations: string[];
};

export type LocalAppStatus = {
  configured: boolean;
  targetId: 'my-local-api';
  targetName: string | null;
  method: 'GET';
  path: string | null;
  limits: { maxConcurrency: number; maxRequestsPerSecond: number; maxDurationSeconds: number; maxRequestsPerRun: number };
  note: string;
};

export type LocalAppRun = {
  id: string;
  targetId: 'my-local-api';
  targetName: string;
  recordedAt: string;
  status: 'completed' | 'cancelled';
  plan: TestPlan;
  executionMode: 'authorized_loopback_http_get';
  metrics: Metrics;
};

export type LocalAppComparison = {
  beforeRunId: string;
  afterRunId: string;
  beforeP95Ms: number;
  afterP95Ms: number;
  p95DeltaMs: number;
  p95ReductionPercent: number | null;
  beforeRps: number;
  afterRps: number;
  beforeErrorRatePercent: number;
  afterErrorRatePercent: number;
  conclusion: 'descriptive_observation_only';
  note: string;
};

export type LocalAppFinding = {
  status: 'evidence_checked_app_observation';
  model: string;
  finding: {
    finding: 'regression_observed' | 'improvement_observed' | 'no_clear_change' | 'inconclusive_errors';
    evidenceIds: string[];
    explanation: string;
    nextStep: string;
  };
  citedEvidence: Array<{ id: string; value: number; unit: string }>;
  limitations: string[];
  cached: boolean;
};

export type DashboardAction =
  | 'appStatus' | 'appRun' | 'appHistory' | 'appCompare' | 'appDiagnose' | 'appCancel'
  | 'health' | 'status' | 'plan' | 'run' | 'history' | 'compare' | 'diagnose' | 'cancel' | 'adjudicate' | 'controlled' | 'hypothesize' | 'reassess';

export const defaultPlan: TestPlan = {
  scenario: 'baseline',
  concurrency: 4,
  durationSeconds: 5,
  requestsPerSecond: 20,
  metricFocus: 'latency',
  hypothesis: 'Compare tail latency of our controlled slow and optimized demo service variants.',
};

export function formatNumber(value: number, precision = 2) {
  return Number.isFinite(value) ? value.toFixed(precision) : '—';
}

export function compactId(id: string) {
  return id.slice(0, 8);
}
