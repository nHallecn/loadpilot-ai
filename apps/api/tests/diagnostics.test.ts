import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { ExperimentService } from '../src/experiments/service.js';
import {
  prepareEvidence,
  verifyDiagnosis,
  type DiagnosisManifest,
  type DiagnosisOutput,
} from '../src/ai/diagnostic-evidence.js';
import {
  createMetaDiagnostician,
  type Diagnostician,
} from '../src/ai/meta-diagnostician.js';

const plan = {
  scenario: 'baseline' as const,
  concurrency: 4,
  durationSeconds: 5,
  requestsPerSecond: 50,
  metricFocus: 'latency' as const,
  hypothesis: 'A private serialized handler may show higher tail latency.',
};

const finding: DiagnosisOutput = {
  category: 'latency_gap_observed',
  confidence: 'low',
  explanation: 'Tail latency is different between the two demo variants, but this does not prove why it changed.',
  evidenceIds: [
    'before.p95_latency_ms',
    'after.p95_latency_ms',
    'comparison.p95_delta_ms',
    'before.request_count',
    'after.request_count',
  ],
  nextExperiment: {
    action: 'repeat_both',
    reason: 'Repeat both demo workloads under the same configured constraints.',
  },
};

describe('evidence-gated model integration', () => {
  const service = new ExperimentService({ durationOverrideMs: 300 });
  afterAll(async () => service.close());

  let manifest: DiagnosisManifest;

  it('constructs measured, compatible numeric manifests', async () => {
    const slow = await service.run({ targetId: 'demo-api', variant: 'slow', plan });
    const fast = await service.run({ targetId: 'demo-api', variant: 'optimized', plan });
    expect(slow?.status).toBe('completed');
    expect(fast?.status).toBe('completed');
    const prepared = prepareEvidence(service, slow!.id, fast!.id);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) throw new Error('Missing evidence');
    manifest = prepared.manifest;
    expect(manifest.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'before.p95_latency_ms', unit: 'ms' }),
      expect.objectContaining({ id: 'after.p95_latency_ms', unit: 'ms' }),
    ]));
    expect(manifest.evidence.some((x) => !Number.isFinite(x.value))).toBe(false);
    expect(JSON.stringify(manifest)).not.toContain('hypothesis');
    expect(verifyDiagnosis(manifest, finding)).toBe(true);
    expect(prepareEvidence(service, fast!.id, slow!.id)).toEqual({
      ok: false,
      reason: 'incompatible_runs',
    });
    expect(prepareEvidence(service, slow!.id, slow!.id)).toEqual({
      ok: false,
      reason: 'incompatible_runs',
    });
  });

  it('sends schema-constrained evidence to Meta, not whole requests, and verifies a finding', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(finding) } }],
    }), { status: 200 })) as unknown as typeof fetch;
    const agent = createMetaDiagnostician({ apiKey: 'test-only-secret', fetchImpl });
    expect(await agent.diagnose(manifest)).toEqual({ model: 'muse-spark-1.3', finding });
    const [url, options] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe('https://api.meta.ai/v1/chat/completions');
    expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer test-only-secret');
    const payload = JSON.parse(options!.body as string);
    expect(payload.response_format.json_schema.strict).toBe(true);
    expect(payload.messages[1].content).toContain('before.p95_latency_ms');
    expect(payload.messages[1].content).not.toContain('serialized handler may');
  });

  it('rejects cited evidence keys that are not present and contradictory categories', async () => {
    const unsupported: DiagnosisOutput = {
      ...finding,
      category: 'no_clear_latency_gap',
      evidenceIds: ['before.p95_latency_ms', 'after.p95_latency_ms'],
    };
    const bad = {
      ...finding,
      evidenceIds: ['before.p95_latency_ms', 'before.p95_latency_ms'],
    };
    expect(verifyDiagnosis(manifest, bad as DiagnosisOutput)).toBe(false);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(unsupported) } }],
    }), { status: 200 })) as unknown as typeof fetch;
    const agent = createMetaDiagnostician({ apiKey: 'test', fetchImpl });
    const difference = manifest.evidence.find((e) => e.id === 'comparison.p95_delta_ms')!.value;
    if (Math.abs(difference) >= 10) {
      await expect(agent.diagnose(manifest)).rejects.toMatchObject({ kind: 'invalid_response' });
    }
  });

  it('retries a rate-limit once then returns sanitized failure', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{}', { status: 429 })) as unknown as typeof fetch;
    const wait = vi.fn(async (_ms: number) => {});
    await expect(createMetaDiagnostician({
      apiKey: 'test', fetchImpl, sleep: wait,
    }).diagnose(manifest)).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledOnce();
  });
});

describe('authenticated diagnosis route', () => {
  const experiments = new ExperimentService({ durationOverrideMs: 300 });
  let calls = 0;
  const diagnostician: Diagnostician = {
    async diagnose() {
      calls++;
      return { model: 'test-model', finding };
    },
  };
  const app = buildApp({ demoToken: 'diagnostic-test-token', experiments, diagnostician });
  afterAll(async () => app.close());

  it('rejects unauthorized requests, malformed IDs and unknown runs without charging', async () => {
    const input = {
      beforeRunId: '00000000-0000-4000-8000-000000000001',
      afterRunId: '00000000-0000-4000-8000-000000000002',
    };
    const unauth = await app.inject({ method: 'POST', url: '/ai/diagnose', payload: input });
    expect(unauth.statusCode).toBe(401);
    const malformed = await app.inject({
      method: 'POST', url: '/ai/diagnose',
      headers: { authorization: 'Bearer diagnostic-test-token' },
      payload: { beforeRunId: 'not-uuid', afterRunId: 'also-not-uuid' },
    });
    expect(malformed.statusCode).toBe(400);
    const unknown = await app.inject({
      method: 'POST', url: '/ai/diagnose',
      headers: { authorization: 'Bearer diagnostic-test-token' },
      payload: input,
    });
    expect(unknown.statusCode).toBe(404);
    expect(calls).toBe(0);
  });

  it('returns only cited measured values and memoizes repeated diagnoses', async () => {
    const slow = await experiments.run({ targetId: 'demo-api', variant: 'slow', plan });
    const optimized = await experiments.run({ targetId: 'demo-api', variant: 'optimized', plan });
    const body = { beforeRunId: slow!.id, afterRunId: optimized!.id };
    const request = () => app.inject({
      method: 'POST',
      url: '/ai/diagnose',
      headers: { authorization: 'Bearer diagnostic-test-token' },
      payload: body,
    });

    const first = await request();
    expect(first.statusCode).toBe(200);
    const result = first.json();
    expect(result.status).toBe('evidence_backed_hypothesis');
    expect(result.model).toBe('test-model');
    expect(result.finding.evidenceIds.length).toBe(5);
    expect(result.citedEvidence.map((e: { id: string }) => e.id).sort())
      .toEqual([...finding.evidenceIds].sort());
    expect(result.nextExperiment.status).toBe('proposal_only');
    expect(result.cached).toBe(false);
    expect(first.body).not.toContain('diagnostic-test-token');
    expect(calls).toBe(1);
    const again = await request();
    expect(again.statusCode).toBe(200);
    expect(again.json().cached).toBe(true);
    expect(calls).toBe(1);
  });
});
