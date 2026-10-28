import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { ExperimentService, type ExperimentRecord } from '../src/experiments/service.js';
import { investigateControlledFactors } from '../src/experiments/controlled-investigation.js';
import {
  initialEvidence, createFollowUp, followUpEvidence, verifyReassessment,
  type HypothesisProposal, type HypothesisReassessment,
} from '../src/ai/hypothesis-evidence.js';
import {
  createMetaHypothesisAgent, type HypothesisAgent,
} from '../src/ai/meta-hypothesis-agent.js';

const basePlan = {
  scenario: 'baseline' as const, concurrency: 1, durationSeconds: 5,
  requestsPerSecond: 10, metricFocus: 'latency' as const,
  hypothesis: 'An initially quiet serialized queue may hide an increase under contention.',
};
const proposal: HypothesisProposal = {
  hypothesis: 'serialization_overhead',
  initialSignal: 'not_observed_at_demo_threshold',
  evidenceIds: ['serialization.before_p95_ms', 'serialization.after_p95_ms'],
  rationale: 'The serialization comparison has no measured p95 improvement at the predeclared threshold in low traffic.',
  followUpAction: 'probe_serialization_high_load',
  whyThisTest: 'Increase the same safe traffic parameters for both variants to see whether a queueing signal appears.',
};

const reassessment = (verdict: HypothesisReassessment['verdict']): HypothesisReassessment => ({
  verdict,
  evidenceIds: [
    'initial.before_p95_ms', 'initial.after_p95_ms',
    'followup.before_p95_ms', 'followup.after_p95_ms',
  ],
  explanation: 'The measured follow-up has revealed how the observed p95 difference depends on traffic load, not a production causal proof.',
  nextStep: 'Repeat the same controlled pairs in randomized order and compare sampling variability.',
});

function record(
  variant: ExperimentRecord['variant'],
  index: number,
  p95: number,
  plan = basePlan,
): ExperimentRecord {
  return {
    id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'),
    targetId: 'demo-api', variant, plan: { ...plan },
    recordedAt: new Date(Date.UTC(2026, 9, 28, 1, 0, index)).toISOString(),
    status: 'completed', executionMode: 'in_process_fastify_inject',
    metrics: {
      requestCount: 20, successCount: 20, errorCount: 0,
      errorRatePercent: 0, durationMs: 4000, observedRps: 5,
      latencyMs: { min: p95, p50: p95, p95, p99: p95, max: p95, mean: p95 },
      latencySamplesMs: Array(20).fill(p95),
    },
  };
}
function initialReport() {
  const runs = [record('slow', 1, 81), record('parallel_slow', 2, 80), record('optimized', 3, 9)];
  const map = new Map(runs.map(run => [run.id, run]));
  const result = investigateControlledFactors(map, {
    serializedRunId: runs[0].id, parallelSameWorkRunId: runs[1].id, parallelFastWorkRunId: runs[2].id,
  });
  if (!result.ok) throw new Error('Invalid fixtures');
  return result.report;
}

describe('safe hypothesis selection and evidence review', () => {
  it('builds numeric-only evidence, blocks model-selected URLs and fixes the traffic plan', () => {
    const report = initialReport();
    const input = initialEvidence(report);
    expect(input.hypotheses[0].signal).toBe('not_observed_at_demo_threshold');
    expect(JSON.stringify(input)).not.toContain('hypothesis text');
    const follow = createFollowUp(report, proposal);
    expect(follow).not.toBeNull();
    expect(follow?.variants).toEqual(['slow','parallel_slow']);
    expect(follow?.plan.concurrency).toBe(8);
    expect(follow?.plan.requestsPerSecond).toBe(30);
    expect(follow?.plan.durationSeconds).toBe(5);
    expect(createFollowUp(report, {
      ...proposal,
      followUpAction: 'repeat_processing',
    })).toBeNull();
    expect(createFollowUp(report, {
      ...proposal,
      initialSignal: 'observed_at_demo_threshold',
    })).toBeNull();
    expect(createFollowUp(report, {
      ...proposal, evidenceIds: ['processing.before_p95_ms','processing.after_p95_ms'],
    })).toBeNull();
    expect(createFollowUp(report, {
      ...proposal, evidenceIds: ['serialization.before_p95_ms','serialization.before_p95_ms'],
    })).toBeNull();
  });

  it('assesses actual new runs and rejects fabricated follow-ups or contradictory model verdicts', () => {
    const report = initialReport();
    const chosen = createFollowUp(report, proposal)!;
    const before = record('slow', 4, 405, { ...chosen.plan });
    const after = record('parallel_slow', 5, 83, { ...chosen.plan });
    const evidence = followUpEvidence(report, proposal, proposal.followUpAction, chosen.plan, before, after);
    expect(evidence?.expectedVerdict).toBe('load_dependent_signal_observed');
    expect(verifyReassessment(evidence!, reassessment('load_dependent_signal_observed'))).toBe(true);
    expect(verifyReassessment(evidence!, reassessment('replicated_signal'))).toBe(false);
    expect(verifyReassessment(evidence!, {
      ...reassessment('load_dependent_signal_observed'),
      evidenceIds: ['initial.before_p95_ms','initial.after_p95_ms','followup.before_p95_ms','followup.before_p95_ms'],
    })).toBe(false);
    expect(followUpEvidence(report, proposal, proposal.followUpAction, chosen.plan,
      record('optimized', 4, 9, { ...chosen.plan }), after)).toBeNull();
    expect(followUpEvidence(report, proposal, proposal.followUpAction, chosen.plan,
      record('slow', 1, 405, { ...chosen.plan }), after)).toBeNull();
    expect(followUpEvidence(report, proposal, proposal.followUpAction, chosen.plan,
      before, record('parallel_slow', 5, 83, basePlan))).toBeNull();
  });

  it('adapts verdict to observed data, not model storytelling', () => {
    const report = initialReport();
    const chosen = createFollowUp(report, proposal)!;
    const noGap = followUpEvidence(report, proposal, proposal.followUpAction, chosen.plan,
      record('slow', 4, 82, { ...chosen.plan }), record('parallel_slow', 5, 81, { ...chosen.plan }));
    expect(noGap?.expectedVerdict).toBe('still_inconclusive');
  });

  it('uses strict Meta structured-output contracts for proposal and reassessment', async () => {
    const mock = vi.fn(async (_url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      const isReview = JSON.stringify(body.messages[1].content).includes('hypotheses.followup.v1');
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(isReview ? reassessment('load_dependent_signal_observed') : proposal) } }],
      }), { status: 200 });
    });
    const agent = createMetaHypothesisAgent({ apiKey: 'private-test-only', fetchImpl: mock as unknown as typeof fetch });
    const p = await agent.propose(initialEvidence(initialReport()));
    expect(p.proposal).toEqual(proposal);
    const report = initialReport();
    const follow = createFollowUp(report, proposal)!;
    const ev = followUpEvidence(report, proposal, proposal.followUpAction, follow.plan,
      record('slow', 4, 405, follow.plan), record('parallel_slow', 5, 81, follow.plan))!;
    const review = await agent.reassess(ev);
    expect(review.assessment.verdict).toBe('load_dependent_signal_observed');
    expect(mock).toHaveBeenCalledTimes(2);
    for (const [, options] of mock.mock.calls) {
      expect(JSON.parse(String(options?.body)).response_format.json_schema.strict).toBe(true);
      expect((options?.headers as Record<string,string>).Authorization).toBe('Bearer private-test-only');
    }
  });
});

describe('protected proposal → user-approved retest → independent AI review', () => {
  const experiments = new ExperimentService({ durationOverrideMs: 1450 });
  let proposals = 0;
  let reviews = 0;
  const model: HypothesisAgent = {
    async propose() { proposals++; return { model: 'mock-muse', proposal }; },
    async reassess(ev) { reviews++; return { model: 'mock-muse', assessment: reassessment(ev.expectedVerdict) }; },
  };
  const app = buildApp({
    demoToken: 'hypothesis-protected-test-token', experiments, hypothesisAgent: model,
  });
  afterAll(async () => app.close());
  const bearer = { authorization: 'Bearer hypothesis-protected-test-token' };
  const run = async (variant: ExperimentRecord['variant'], plan = basePlan) => {
    const res = await app.inject({
      method: 'POST', url: '/experiments/run', headers: bearer,
      payload: { targetId: 'demo-api', variant, plan },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().metrics.requestCount).toBeGreaterThanOrEqual(10);
    return res.json() as ExperimentRecord;
  };

  it('refuses anonymous requests and only calls the model for valid, completed controlled evidence', async () => {
    const unauth = await app.inject({
      method: 'POST', url: '/ai/hypotheses',
      payload: { serializedRunId: 'x', parallelSameWorkRunId: 'y', parallelFastWorkRunId: 'z' },
    });
    expect(unauth.statusCode).toBe(401);
    const invalid = await app.inject({
      method: 'POST', url: '/ai/hypotheses', headers: bearer,
      payload: { serializedRunId: 'x', parallelSameWorkRunId: 'y', parallelFastWorkRunId: 'z' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(proposals).toBe(0);
  });

  it('retests fresh approved variants, caches valid findings, rejects incorrect evidence', async () => {
    const runs = [];
    for (const v of ['slow','parallel_slow','optimized'] as const) runs.push(await run(v));
    const ids = {
      serializedRunId: runs[0].id, parallelSameWorkRunId: runs[1].id, parallelFastWorkRunId: runs[2].id,
    };
    const initial = await app.inject({ method: 'POST', url: '/ai/hypotheses', headers: bearer, payload: ids });
    expect(initial.statusCode).toBe(200);
    const session = initial.json();
    expect(session.followUp.status).toBe('proposal_only');
    expect(session.followUp.plan.requestsPerSecond).toBe(30);
    expect(proposals).toBe(1);
    const repeated = await app.inject({ method: 'POST', url: '/ai/hypotheses', headers: bearer, payload: ids });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().cached).toBe(true);
    expect(proposals).toBe(1);

    const premature = await app.inject({
      method: 'POST', url: '/ai/reassess', headers: bearer,
      payload: {
        investigationId: session.investigationId,
        followUpBeforeRunId: runs[0].id, followUpAfterRunId: runs[1].id,
      },
    });
    expect(premature.statusCode).toBe(422);
    expect(reviews).toBe(0);

    const retestBefore = await run('slow', session.followUp.plan);
    const retestAfter = await run('parallel_slow', session.followUp.plan);
    const input = {
      investigationId: session.investigationId,
      followUpBeforeRunId: retestBefore.id,
      followUpAfterRunId: retestAfter.id,
    };
    const reviewed = await app.inject({ method: 'POST', url: '/ai/reassess', headers: bearer, payload: input });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().assessment.verdict).toBe('load_dependent_signal_observed');
    expect(reviewed.json().citedEvidence).toHaveLength(4);
    expect(reviews).toBe(1);
    const again = await app.inject({ method: 'POST', url: '/ai/reassess', headers: bearer, payload: input });
    expect(again.statusCode).toBe(200);
    expect(again.json().cached).toBe(true);
    expect(reviews).toBe(1);

    const wrong = await app.inject({
      method: 'POST', url: '/ai/reassess', headers: bearer,
      payload: { ...input, followUpAfterRunId: runs[1].id },
    });
    expect(wrong.statusCode).toBe(422);
  }, 25000);
});
