import { randomUUID } from 'node:crypto';
import type { TestPlan } from '../ai/schemas.js';
import { runBoundedExperiment, type RunMetrics } from '../experiments/runner.js';
import type { AppRunRequest, LocalTargetConfig } from './contracts.js';

export type ApplicationRun = {
  id: string;
  targetId: 'my-local-api';
  targetName: string;
  recordedAt: string;
  status: 'completed' | 'cancelled';
  plan: TestPlan;
  executionMode: 'authorized_loopback_http_get';
  metrics: RunMetrics;
};

export type ApplicationComparison = {
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

function samePlan(a: TestPlan, b: TestPlan) {
  return a.scenario === b.scenario &&
    a.concurrency === b.concurrency &&
    a.durationSeconds === b.durationSeconds &&
    a.requestsPerSecond === b.requestsPerSecond &&
    a.metricFocus === b.metricFocus;
}

export class ApplicationTestService {
  private readonly records = new Map<string, ApplicationRun>();
  private activeController?: AbortController;
  constructor(readonly config?: LocalTargetConfig) {}

  get active() { return Boolean(this.activeController); }
  get enabled() { return Boolean(this.config); }

  cancel(): boolean {
    if (!this.activeController) return false;
    this.activeController.abort();
    return true;
  }

  async close() { this.cancel(); }

  list() { return [...this.records.values()].reverse(); }
  get(id: string) { return this.records.get(id); }

  async run(request: AppRunRequest): Promise<ApplicationRun | null> {
    if (!this.config) throw new Error('Local application target is not configured');
    if (this.activeController) return null;

    // No external requests are possible: URL was validated at server initialization,
    // and there is no user-supplied host/path/header/method in this request.
    const controller = new AbortController();
    this.activeController = controller;
    try {
      const result = await runBoundedExperiment(
        request.plan,
        'optimized',
        async () => {
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(2000)]);
          const response = await fetch(this.config!.url, {
            method: 'GET',
            redirect: 'manual',
            headers: { 'X-LoadPilot-Test': 'authorized-loopback' },
            cache: 'no-store',
            signal,
          });
          try {
            // 3xx must not look successful: redirects are never followed.
            return { statusCode: response.status >= 300 && response.status < 400 ? 502 : response.status };
          } finally {
            await response.body?.cancel();
          }
        },
        { signal: controller.signal },
      );

      const record: ApplicationRun = {
        id: randomUUID(),
        targetId: 'my-local-api',
        targetName: this.config.displayName,
        recordedAt: new Date().toISOString(),
        status: result.cancelled ? 'cancelled' : 'completed',
        executionMode: 'authorized_loopback_http_get',
        plan: { ...request.plan },
        metrics: result.metrics,
      };
      this.records.set(record.id, record);
      while (this.records.size > 12) {
        const firstId = this.records.keys().next().value;
        if (firstId) this.records.delete(firstId);
      }
      return record;
    } finally {
      this.activeController = undefined;
    }
  }

  compare(beforeRunId: string, afterRunId: string): ApplicationComparison | null {
    const before = this.records.get(beforeRunId);
    const after = this.records.get(afterRunId);
    if (!before || !after ||
        beforeRunId === afterRunId ||
        before.status !== 'completed' || after.status !== 'completed' ||
        before.targetId !== after.targetId ||
        !samePlan(before.plan, after.plan) ||
        Date.parse(before.recordedAt) > Date.parse(after.recordedAt)) return null;

    const rounded = (n: number) => Math.round(n * 100) / 100;
    const a = before.metrics.latencyMs.p95;
    const b = after.metrics.latencyMs.p95;
    return {
      beforeRunId, afterRunId,
      beforeP95Ms: a, afterP95Ms: b,
      p95DeltaMs: rounded(b - a),
      p95ReductionPercent: a > 0 ? rounded((a - b) / a * 100) : null,
      beforeRps: before.metrics.observedRps,
      afterRps: after.metrics.observedRps,
      beforeErrorRatePercent: before.metrics.errorRatePercent,
      afterErrorRatePercent: after.metrics.errorRatePercent,
      conclusion: 'descriptive_observation_only',
      note: 'The endpoint and plan match, but the runs are not randomized. Do not attribute a latency difference to a particular code change without separate controls.',
    };
  }
}
