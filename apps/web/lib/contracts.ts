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
  variant: 'slow' | 'optimized';
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

export type DashboardAction =
  | 'health' | 'status' | 'plan' | 'run' | 'history' | 'compare' | 'diagnose' | 'cancel';

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
