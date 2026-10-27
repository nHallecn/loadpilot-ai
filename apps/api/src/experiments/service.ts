import { randomUUID } from 'node:crypto';
import type { TestPlan } from '../ai/schemas.js';
import { createDemoTarget } from './demo-target.js';
import { runBoundedExperiment, type RunMetrics } from './runner.js';
import type { ExperimentRequest } from './schemas.js';

export type ExperimentRecord = {
  id: string;
  targetId: 'demo-api';
  variant: 'slow' | 'optimized';
  plan: TestPlan;
  recordedAt: string;
  status: 'completed' | 'cancelled';
  metrics: RunMetrics;
  executionMode: 'in_process_fastify_inject';
};

export type ExperimentComparison = {
  beforeRunId: string;
  afterRunId: string;
  p95DeltaMs: number;
  p95ReductionPercent: number | null;
  throughputDeltaRps: number;
  beforeErrorRatePercent: number;
  afterErrorRatePercent: number;
  evidence: 'observed_measurements_not_causal_proof';
};

export class ExperimentService {
  private readonly target = createDemoTarget();
  private readonly records = new Map<string, ExperimentRecord>();
  private readonly durationOverrideMs?: number;
  private controller: AbortController | undefined;

  constructor(options: { durationOverrideMs?: number } = {}) {
    this.durationOverrideMs = options.durationOverrideMs;
  }

  get active() { return Boolean(this.controller); }

  cancel(): boolean {
    if (!this.controller) return false;
    this.controller.abort();
    return true;
  }

  async close() {
    this.cancel();
    await this.target.close();
  }

  async run(request: ExperimentRequest): Promise<ExperimentRecord | null> {
    // Atomic in a single Node.js event loop: claim the slot before first await.
    if (this.controller) return null;
    const controller = new AbortController();
    this.controller = controller;

    try {
      const result = await runBoundedExperiment(
        request.plan,
        request.variant,
        async (variant) => {
          const response = await this.target.inject({
            method: 'GET',
            url: '/work',
            query: { variant },
          });
          return { statusCode: response.statusCode };
        },
        { signal: controller.signal, durationOverrideMs: this.durationOverrideMs },
      );
      const record: ExperimentRecord = {
        id: randomUUID(),
        targetId: request.targetId,
        variant: request.variant,
        plan: request.plan,
        recordedAt: new Date().toISOString(),
        status: result.cancelled ? 'cancelled' : 'completed',
        metrics: result.metrics,
        executionMode: 'in_process_fastify_inject',
      };
      this.records.set(record.id, record);
      while (this.records.size > 12) {
        const first = this.records.keys().next().value;
        if (first) this.records.delete(first);
      }
      return record;
    } finally {
      this.controller = undefined;
    }
  }

  list() {
    return Array.from(this.records.values()).reverse();
  }

  get(id: string) {
    return this.records.get(id);
  }

  compare(beforeRunId: string, afterRunId: string): ExperimentComparison | null {
    const before = this.records.get(beforeRunId);
    const after = this.records.get(afterRunId);
    if (!before || !after || before.status !== 'completed' || after.status !== 'completed') {
      return null;
    }
    const round = (value: number) => Math.round(value * 100) / 100;
    const beforeP95 = before.metrics.latencyMs.p95;
    const afterP95 = after.metrics.latencyMs.p95;
    return {
      beforeRunId,
      afterRunId,
      p95DeltaMs: round(afterP95 - beforeP95),
      p95ReductionPercent: beforeP95 > 0 ? round(((beforeP95 - afterP95) / beforeP95) * 100) : null,
      throughputDeltaRps: round(after.metrics.observedRps - before.metrics.observedRps),
      beforeErrorRatePercent: before.metrics.errorRatePercent,
      afterErrorRatePercent: after.metrics.errorRatePercent,
      evidence: 'observed_measurements_not_causal_proof',
    };
  }
}
