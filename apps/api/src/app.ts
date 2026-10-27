import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { planRequestSchema } from './ai/schemas.js';
import { createMetaPlanner, PlannerError, type Planner } from './ai/meta-planner.js';

type AppOptions = {
  planner?: Planner;
  demoToken?: string;
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

  return app;
}
