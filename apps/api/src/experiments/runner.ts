import { performance } from 'node:perf_hooks';
import type { TestPlan } from '../ai/schemas.js';
import type { Variant } from './schemas.js';

const MAX_REQUESTS = 500;

export type RequestOutcome = { statusCode: number };
export type Dispatch = (variant: Variant) => Promise<RequestOutcome>;
export type RunnerOptions = {
  signal?: AbortSignal;
  /** Shortened time window for automated tests only; not exposed in HTTP API. */
  durationOverrideMs?: number;
};

export type RunMetrics = {
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

function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return 0;
  const rank = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.max(0, rank)];
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Constant-size worker pool, global request-start interval and hard request cap.
 * No networking is performed here; dispatch is a private in-process target.
 */
export async function runBoundedExperiment(
  plan: TestPlan,
  variant: Variant,
  dispatch: Dispatch,
  options: RunnerOptions = {},
): Promise<{ metrics: RunMetrics; cancelled: boolean }> {
  const start = performance.now();
  const durationMs = options.durationOverrideMs ?? plan.durationSeconds * 1000;
  const deadline = start + durationMs;
  let nextSlot = start;
  let launched = 0;
  let failures = 0;
  const samples: number[] = [];

  const worker = async () => {
    while (!options.signal?.aborted) {
      if (launched >= MAX_REQUESTS) return;
      const slot = nextSlot;
      nextSlot += 1000 / plan.requestsPerSecond;
      if (slot >= deadline) return;

      await wait(Math.max(0, slot - performance.now()), options.signal);
      if (options.signal?.aborted || performance.now() >= deadline) return;
      if (launched >= MAX_REQUESTS) return;
      launched += 1;

      const requestStart = performance.now();
      try {
        const response = await dispatch(variant);
        if (response.statusCode < 200 || response.statusCode >= 400) failures++;
      } catch {
        failures++;
      } finally {
        samples.push(Math.max(0, performance.now() - requestStart));
      }
    }
  };

  await Promise.all(Array.from({ length: plan.concurrency }, () => worker()));
  const elapsed = Math.max(performance.now() - start, 0.001);
  const sorted = samples.sort((a, b) => a - b);
  const sum = sorted.reduce((total, sample) => total + sample, 0);
  const round = (value: number) => Math.round(value * 100) / 100;
  const completed = sorted.length;

  return {
    cancelled: Boolean(options.signal?.aborted),
    metrics: {
      requestCount: completed,
      successCount: completed - failures,
      errorCount: failures,
      errorRatePercent: round(completed ? (failures / completed) * 100 : 0),
      durationMs: round(elapsed),
      observedRps: round((completed / elapsed) * 1000),
      latencyMs: {
        min: round(sorted[0] ?? 0),
        p50: round(percentile(sorted, 0.5)),
        p95: round(percentile(sorted, 0.95)),
        p99: round(percentile(sorted, 0.99)),
        max: round(sorted[completed - 1] ?? 0),
        mean: round(completed ? sum / completed : 0),
      },
      latencySamplesMs: sorted.map(round),
    },
  };
}
