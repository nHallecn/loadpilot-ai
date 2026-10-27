import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { planRequestSchema } from './ai/schemas.js';
import { createMetaPlanner, PlannerError, type Planner } from './ai/meta-planner.js';
import { ExperimentService } from './experiments/service.js';
import { compareRequestSchema, experimentRequestSchema } from './experiments/schemas.js';
import { z } from 'zod';

type AppOptions = {
  planner?: Planner;
  demoToken?: string;
  experiments?: ExperimentService;
};

function validBearer(header: string | undefined, expected: string) {
  if (!header?.startsWith('Bearer ') || !expected) return false;
  const supplied = Buffer.from(header.slice(7));
  const allowed = Buffer.from(expected);
  return supplied.length === allowed.length && timingSafeEqual(supplied, allowed);
}

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: true, bodyLimit: 4096 });
  const demoToken = options.demoToken ?? process.env.LOADPILOT_DEMO_TOKEN ?? '';
  const experiments = options.experiments ?? new ExperimentService();
  app.addHook('onClose', async () => experiments.close());
  const apiKey = process.env.MODEL_API_KEY ?? '';
  const planner = options.planner ??
    (apiKey ? createMetaPlanner({ apiKey, model: process.env.META_MODEL || 'muse-spark-1.3' }) : undefined);

  app.get('/health', async () => ({ status: 'ok', service: 'loadpilot-api' }));

  app.get('/ai/status', async () => ({
    status: planner && demoToken ? 'configured' : 'disabled',
    capability: 'test_plan_proposal',
  }));

  app.post('/ai/plan', async (request, reply) => {
    if (!planner || !demoToken) {
      return reply.code(503).send({ error: 'AI planning is not configured' });
    }
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const parsed = planRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid plan request', issues: parsed.error.flatten() });
    }

    try {
      const result = await planner.plan(parsed.data.objective);
      return reply.code(200).send({
        targetId: 'demo-api',
        status: 'proposal_only',
        model: result.model,
        plan: result.plan,
      });
    } catch (error) {
      if (error instanceof PlannerError) {
        const status = error.kind === 'rate_limited' ? 429 : error.kind === 'timeout' ? 504 : 502;
        return reply.code(status).send({ error: 'AI planning unavailable', reason: error.kind });
      }
      request.log.error({ type: 'unexpected_ai_error' }, 'AI planning failed');
      return reply.code(502).send({ error: 'AI planning unavailable' });
    }
  });


  // This milestone intentionally runs only against a private Fastify.inject()
  // target created by ExperimentService. No URL or hostname is accepted.
  app.post('/experiments/run', async (request, reply) => {
    if (!demoToken) return reply.code(503).send({ error: 'Experiment service not configured' });
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const parsed = experimentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid experiment', issues: parsed.error.flatten() });
    }
    if (experiments.active) {
      return reply.code(409).send({ error: 'An experiment is already running' });
    }
    try {
      const record = await experiments.run(parsed.data);
      if (!record) return reply.code(409).send({ error: 'An experiment is already running' });
      return reply.code(200).send(record);
    } catch {
      request.log.error({ type: 'experiment_failed' }, 'Internal experiment failed');
      return reply.code(500).send({ error: 'Experiment failed' });
    }
  });

  app.delete('/experiments/active', async (request, reply) => {
    if (!demoToken) return reply.code(503).send({ error: 'Experiment service not configured' });
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    return reply.code(experiments.cancel() ? 202 : 404).send({
      status: experiments.active ? 'cancellation_requested' : 'no_active_experiment',
    });
  });

  app.get('/experiments', async (request, reply) => {
    if (!demoToken) return reply.code(503).send({ error: 'Experiment service not configured' });
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    return reply.send({ runs: experiments.list() });
  });

  app.get<{ Params: { id: string } }>('/experiments/:id', async (request, reply) => {
    if (!demoToken) return reply.code(503).send({ error: 'Experiment service not configured' });
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    if (!z.string().uuid().safeParse(request.params.id).success) {
      return reply.code(400).send({ error: 'Invalid run ID' });
    }
    const record = experiments.get(request.params.id);
    return record ? reply.send(record) : reply.code(404).send({ error: 'Run not found' });
  });

  app.post('/experiments/compare', async (request, reply) => {
    if (!demoToken) return reply.code(503).send({ error: 'Experiment service not configured' });
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const parsed = compareRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid comparison request' });
    const comparison = experiments.compare(parsed.data.beforeRunId, parsed.data.afterRunId);
    return comparison ? reply.send(comparison) : reply.code(404).send({ error: 'Completed runs not found' });
  });

  return app;
}

