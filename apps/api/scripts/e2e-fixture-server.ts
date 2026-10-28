/**
 * Only for browser CI. Uses real Fastify, the real bounded in-process runner
 * and actual timing measurements. AI *responses* are injected fixtures so
 * no Meta credits/credentials are required in GitHub Actions.
 *
 * Guard: refusing to start without explicit test flags. Always binds loopback.
 */
import { buildApp } from '../src/app.js';
import type { Planner } from '../src/ai/meta-planner.js';
import type { Diagnostician } from '../src/ai/meta-diagnostician.js';
import type { HypothesisAgent } from '../src/ai/meta-hypothesis-agent.js';
import { ExperimentService } from '../src/experiments/service.js';

if (process.env.LOADPILOT_E2E !== '1' || process.env.NODE_ENV !== 'test') {
  throw new Error('Browser fixture server is restricted to explicit test mode');
}

const token = process.env.LOADPILOT_DEMO_TOKEN;
if (!token || token.length < 24 || process.env.MODEL_API_KEY) {
  throw new Error('Use a strong TEST-only token and never load a real Meta API key for browser CI');
}

const planner: Planner = {
  async plan() {
    return {
      model: 'fixture-model-no-meta-calls',
      plan: {
        scenario: 'baseline',
        concurrency: 4,
        durationSeconds: 5,
        requestsPerSecond: 20,
        metricFocus: 'latency',
        hypothesis: 'Controlled slow versus optimized demonstration with real in-process measurements.',
      },
    };
  },
};

const diagnostician: Diagnostician = {
  async diagnose(manifest) {
    const before = manifest.evidence.find(m => m.id === 'before.p95_latency_ms')!.value;
    const after = manifest.evidence.find(m => m.id === 'after.p95_latency_ms')!.value;
    return {
      model: 'fixture-model-no-meta-calls',
      finding: {
        category: Math.abs(before - after) >= 5 ? 'latency_gap_observed' : 'inconclusive',
        confidence: 'low',
        explanation: 'The measured p95 latency comparison suggests a demonstration-only difference, but it does not establish a causal root cause.',
        evidenceIds: ['before.p95_latency_ms', 'after.p95_latency_ms', 'before.request_count', 'after.request_count'],
        nextExperiment: {
          action: 'repeat_both',
          reason: 'Repeat the exact original two bounded configurations and compare fresh measured latency.',
        },
      },
    };
  },
};

const hypothesisAgent: HypothesisAgent = {
  async propose(evidence) {
    const serial = evidence.hypotheses.find(h => h.id === 'serialization_overhead')!;
    const low = evidence.load.concurrency <= 2 && evidence.load.requestsPerSecond <= 10;
    const probe = low && serial.signal === 'not_observed_at_demo_threshold';
    return {
      model: 'fixture-model-no-meta-calls',
      proposal: {
        hypothesis: 'serialization_overhead',
        initialSignal: serial.signal,
        evidenceIds: ['serialization.before_p95_ms', 'serialization.after_p95_ms',
          'serialization.before_requests', 'serialization.after_requests'],
        rationale: 'The actual initial control contrast supports further examination of serialized work with a matched retest.',
        followUpAction: probe ? 'probe_serialization_high_load' : 'repeat_serialization',
        whyThisTest: probe
          ? 'A bounded higher-load probe can show whether low traffic concealed the serialized queue.'
          : 'Repeating the same synthetic contrast checks whether the current descriptive signal persists.',
      },
    };
  },
  async reassess(evidence) {
    return {
      model: 'fixture-model-no-meta-calls',
      assessment: {
        verdict: evidence.expectedVerdict,
        evidenceIds: ['initial.before_p95_ms', 'initial.after_p95_ms',
          'followup.before_p95_ms', 'followup.after_p95_ms'],
        explanation: 'The new observations were measured independently; the expected category was derived from numeric evidence, not guessed by a model.',
        nextStep: 'Repeat controlled pairs in randomized order to investigate run-to-run variation before production claims.',
      },
    };
  },
};

const app = buildApp({
  demoToken: token,
  experiments: new ExperimentService(),
  planner,
  diagnostician,
  hypothesisAgent,
  hypothesisCooldownMs: 0,
});

await app.listen({ host: '127.0.0.1', port: 4000 });
const stop = async () => { await app.close(); process.exit(0); };
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
