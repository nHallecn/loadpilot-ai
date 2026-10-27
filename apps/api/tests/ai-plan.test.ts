import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createMetaPlanner, PlannerError, type Planner } from '../src/ai/meta-planner.js';

const validPlan = {
  scenario: 'baseline',
  concurrency: 5,
  durationSeconds: 10,
  requestsPerSecond: 15,
  metricFocus: 'latency',
  hypothesis: 'Check whether increased concurrency causes tail latency to rise.',
};

const body = {
  targetId: 'demo-api',
  objective: 'Investigate the latency of our sample API under safe load.',
};

function makeFetch(bodyValue: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(bodyValue), {
    status,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof fetch;
}

describe('Meta Model API adapter', () => {
  it('sends authenticated structured output request and validates the result', async () => {
    const fetchImpl = makeFetch({ choices: [{ message: { content: JSON.stringify(validPlan) } }] });
    const planner = createMetaPlanner({ apiKey: 'test-only-secret', fetchImpl });
    const result = await planner.plan(body.objective);
    expect(result).toEqual({ plan: validPlan, model: 'muse-spark-1.3' });

    const [endpoint, opts] = vi.mocked(fetchImpl).mock.calls[0];
    expect(endpoint).toBe('https://api.meta.ai/v1/chat/completions');
    expect((opts?.headers as Record<string, string>).Authorization).toBe('Bearer test-only-secret');
    const payload = JSON.parse(opts?.body as string);
    expect(payload.model).toBe('muse-spark-1.3');
    expect(payload.response_format.json_schema.strict).toBe(true);
    expect(payload.messages[1].content).toContain(body.objective);
  });

  it('rejects a model plan that exceeds hard safety limits', async () => {
    const fetchImpl = makeFetch({
      choices: [{ message: { content: JSON.stringify({ ...validPlan, concurrency: 100000 }) } }],
    });
    await expect(createMetaPlanner({ apiKey: 'test', fetchImpl }).plan(body.objective))
      .rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('does not retry authentication failures', async () => {
    const fetchImpl = makeFetch({ error: { message: 'Invalid key' } }, 401);
    await expect(createMetaPlanner({ apiKey: 'test', fetchImpl }).plan(body.objective))
      .rejects.toMatchObject({ kind: 'upstream' });
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
  });

  it('retries a rate limit once without leaking upstream errors', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(validPlan) } }],
      }), { status: 200 })) as unknown as typeof fetch;
    const sleep = vi.fn(async (_ms: number) => {});
    const planner = createMetaPlanner({ apiKey: 'test', fetchImpl, sleep });
    expect((await planner.plan(body.objective)).plan).toEqual(validPlan);
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('classifies a timeout', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('Timed out', 'TimeoutError');
    }) as unknown as typeof fetch;
    const planner = createMetaPlanner({ apiKey: 'test', fetchImpl, sleep: async () => {} });
    await expect(planner.plan(body.objective))
      .rejects.toMatchObject({ kind: 'timeout' } satisfies Partial<PlannerError>);
  });
});

describe('AI plan routes', () => {
  const planner: Planner = { plan: async () => ({ model: 'muse-spark-1.3', plan: validPlan }) };
  const app = buildApp({ planner, demoToken: 'demo-test-token' });
  afterAll(async () => { await app.close(); });

  it('requires the server-side demo token', async () => {
    const response = await app.inject({ method: 'POST', url: '/ai/plan', payload: body });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('demo-test-token');
  });

  it('rejects objectives or targets outside the allowed contract', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/ai/plan',
      headers: { authorization: 'Bearer demo-test-token' },
      payload: { ...body, targetId: 'https://somewhere.example' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns a non-executable proposal', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/ai/plan',
      headers: { authorization: 'Bearer demo-test-token' },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      targetId: 'demo-api', status: 'proposal_only',
      model: 'muse-spark-1.3', plan: validPlan,
    });
  });

  it('never exposes a secret in readiness response', async () => {
    const response = await app.inject({ method: 'GET', url: '/ai/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'configured', capability: 'test_plan_proposal' });
    expect(response.body).not.toContain('demo-test-token');
  });
});
