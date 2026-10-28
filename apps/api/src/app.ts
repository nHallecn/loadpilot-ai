import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { planRequestSchema } from './ai/schemas.js';
import { createMetaPlanner, PlannerError, type Planner } from './ai/meta-planner.js';
import { ExperimentService } from './experiments/service.js';
import { compareRequestSchema, experimentRequestSchema } from './experiments/schemas.js';
import { z } from 'zod';
import { createMetaDiagnostician, DiagnosticError, type Diagnostician } from './ai/meta-diagnostician.js';
import { diagnosisRequestSchema, prepareEvidence } from './ai/diagnostic-evidence.js';
import { adjudicateTrials, trialPairsSchema } from './experiments/adjudication.js';
import { controlledRequestSchema, investigateControlledFactors, type ControlledReport } from './experiments/controlled-investigation.js';
import { randomUUID } from 'node:crypto';
import { createMetaHypothesisAgent, HypothesisAgentError, type HypothesisAgent } from './ai/meta-hypothesis-agent.js';
import { initialEvidence, createFollowUp, followUpEvidence, verifyReassessment, proposeRequestSchema, reassessRequestSchema, type HypothesisProposal } from './ai/hypothesis-evidence.js';
import type { TestPlan } from './ai/schemas.js';

type AppOptions = {
  planner?: Planner;
  demoToken?: string;
  experiments?: ExperimentService;
  diagnostician?: Diagnostician;
  hypothesisAgent?: HypothesisAgent;
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
  const diagnostician = options.diagnostician ??
    (apiKey ? createMetaDiagnostician({ apiKey, model: process.env.META_MODEL || 'muse-spark-1.3' }) : undefined);
  const hypothesisAgent = options.hypothesisAgent ??
    (apiKey ? createMetaHypothesisAgent({ apiKey, model: process.env.META_MODEL || 'muse-spark-1.3' }) : undefined);
  type HypothesisSession = {
    id: string;
    key: string;
    createdAt: number;
    report: ControlledReport;
    proposal: HypothesisProposal;
    model: string;
    plan: TestPlan;
    variants: ['slow', 'parallel_slow'] | ['parallel_slow', 'optimized'];
    reviewed?: unknown;
  };
  const hypothesisSessions = new Map<string, HypothesisSession>();
  let hypothesisBusy = false;
  let lastHypothesisCallAt = 0;
  const hypothesisCooldownMs = 8000;
  const sessionTtlMs = 30 * 60 * 1000;
  const mapHypothesisError = (error: unknown) => error instanceof HypothesisAgentError
    ? { status: error.kind === 'rate_limited' ? 429 : error.kind === 'timeout' ? 504 : 502, reason: error.kind }
    : { status: 502, reason: 'upstream' };
  const diagnosisCache = new Map<string, unknown>();
  let diagnosisActive = false;
  let lastUncachedDiagnosis = 0;

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

  /**
   * Read-only adjudication: no new workload or paid AI call. Returns a checksum
   * with a complete source-run snapshot so it can be exported and independently
   * verified after in-memory history expires.
   */
  app.post('/experiments/adjudicate', async (request, reply) => {
    if (!demoToken) return reply.code(503).send({ error: 'Experiment service not configured' });
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const parsed = trialPairsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid trial pairs', issues: parsed.error.flatten() });
    }
    const result = adjudicateTrials(experiments, parsed.data.pairs);
    if (!result.ok) {
      return reply.code(result.reason === 'missing_run' ? 404 : 422).send({
        error: result.reason === 'missing_run'
          ? 'Run not found (history is in-memory only)'
          : 'Trials must be distinct, completed, ordered slow/optimized pairs with matching test parameters and at least 10 samples per run',
      });
    }
    return reply.code(200).send(result.report);
  });


  // A read-only evidence assessment: it never generates traffic or requests Meta credits.
  app.post('/investigations/controlled', async (request, reply) => {
    if (!demoToken) return reply.code(503).send({ error: 'Investigation service not configured' });
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const parsed = controlledRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid controlled investigation request' });
    }
    const report = investigateControlledFactors(experiments, parsed.data);
    if (!report.ok) {
      return reply.code(report.reason === 'missing_run' ? 404 : 422).send({
        error: report.reason === 'missing_run'
          ? 'One or more run IDs no longer exist'
          : 'Expected three distinct complete runs: slow, parallel_slow, optimized; identical test settings and at least 10 samples each',
      });
    }
    return reply.code(200).send(report.report);
  });

  /**
   * A Muse Spark hypothesis is advisory: only deterministic code constructs
   * the selectable two-variant follow-up. No server-side auto-execution.
   */
  app.post('/ai/hypotheses', async (request, reply) => {
    if (!hypothesisAgent || !demoToken) return reply.code(503).send({ error: 'AI hypotheses not configured' });
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const parsed = proposeRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid hypothesis input' });
    const source = investigateControlledFactors(experiments, parsed.data);
    if (!source.ok) return reply.code(source.reason === 'missing_run' ? 404 : 422).send({
      error: 'Three compatible completed controlled experiments are required',
    });

    // Identical requests reuse stored results to avoid unnecessary paid calls.
    const key = Object.values(parsed.data).join(':');
    for (const [id, session] of hypothesisSessions) {
      if (Date.now() - session.createdAt > sessionTtlMs) {
        hypothesisSessions.delete(id);
      } else if (session.key === key) {
        return reply.send({
          investigationId: session.id,
          model: session.model,
          hypothesis: session.proposal,
          followUp: { plan: session.plan, variants: session.variants, status: 'proposal_only' },
          cached: true,
          note: 'No experiment is launched by the model or this endpoint.',
        });
      }
    }
    if (hypothesisBusy || Date.now() - lastHypothesisCallAt < hypothesisCooldownMs) {
      return reply.code(429).send({ error: 'AI hypothesis request busy or cooling down' });
    }
    hypothesisBusy = true;
    lastHypothesisCallAt = Date.now();
    try {
      const { model, proposal } = await hypothesisAgent.propose(initialEvidence(source.report));
      const followUp = createFollowUp(source.report, proposal);
      if (!followUp) return reply.code(502).send({ error: 'Model proposal rejected by deterministic safety validation' });
      const id = randomUUID();
      const session: HypothesisSession = {
        id, key, createdAt: Date.now(), report: source.report, proposal, model,
        plan: followUp.plan, variants: followUp.variants,
      };
      hypothesisSessions.set(id, session);
      while (hypothesisSessions.size > 8) {
        const oldest = hypothesisSessions.keys().next().value;
        if (oldest) hypothesisSessions.delete(oldest);
      }
      return reply.send({
        investigationId: id,
        model,
        hypothesis: proposal,
        followUp: { plan: followUp.plan, variants: followUp.variants, status: 'proposal_only' },
        cached: false,
        note: 'The model proposed a test; a user must explicitly launch each bounded run.',
      });
    } catch (error) {
      const mapped = mapHypothesisError(error);
      return reply.code(mapped.status).send({ error: 'AI hypothesis unavailable', reason: mapped.reason });
    } finally {
      hypothesisBusy = false;
    }
  });

  app.post('/ai/reassess', async (request, reply) => {
    if (!hypothesisAgent || !demoToken) return reply.code(503).send({ error: 'AI review not configured' });
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const parsed = reassessRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid reassessment request' });
    const session = hypothesisSessions.get(parsed.data.investigationId);
    if (!session || Date.now() - session.createdAt > sessionTtlMs) {
      hypothesisSessions.delete(parsed.data.investigationId);
      return reply.code(404).send({ error: 'Investigation expired or not found' });
    }
    const before = experiments.get(parsed.data.followUpBeforeRunId);
    const after = experiments.get(parsed.data.followUpAfterRunId);
    if (!before || !after) return reply.code(404).send({ error: 'Follow-up run not found' });

    const evidence = followUpEvidence(
      session.report, session.proposal, session.proposal.followUpAction,
      session.plan, before, after,
    );
    if (!evidence) return reply.code(422).send({
      error: 'Follow-up requires two new, completed, correctly ordered runs using the exact approved plan',
    });
    if (session.reviewed) {
      const previous = session.reviewed as { followUpRunIds: string[] };
      if (previous.followUpRunIds[0] !== before.id || previous.followUpRunIds[1] !== after.id) {
        return reply.code(409).send({ error: 'This investigation already reviewed a different follow-up' });
      }
      return reply.send({ ...session.reviewed as object, cached: true });
    }
    if (hypothesisBusy || Date.now() - lastHypothesisCallAt < hypothesisCooldownMs) {
      return reply.code(429).send({ error: 'AI review busy or cooling down' });
    }
    hypothesisBusy = true;
    lastHypothesisCallAt = Date.now();

    try {
      const { model, assessment } = await hypothesisAgent.reassess(evidence);
      if (!verifyReassessment(evidence, assessment)) {
        return reply.code(502).send({ error: 'Model assessment contradicted the measured evidence' });
      }
      const numeric = {
        'initial.before_p95_ms': evidence.initial.beforeP95Ms,
        'initial.after_p95_ms': evidence.initial.afterP95Ms,
        'followup.before_p95_ms': evidence.followup.beforeP95Ms,
        'followup.after_p95_ms': evidence.followup.afterP95Ms,
        'initial.before_requests': evidence.initial.beforeRequests,
        'initial.after_requests': evidence.initial.afterRequests,
        'followup.before_requests': evidence.followup.beforeRequests,
        'followup.after_requests': evidence.followup.afterRequests,
      };
      const response = {
        status: 'followup_evaluated',
        investigationId: session.id,
        model,
        hypothesis: session.proposal.hypothesis,
        initialSignal: evidence.initial.signal,
        followUpSignal: evidence.followup.signal,
        assessment,
        citedEvidence: assessment.evidenceIds.map(id => ({ id, value: numeric[id] })),
        load: evidence.load,
        followUpRunIds: [before.id, after.id],
        limitations: [
          'This is descriptive evidence from an in-process synthetic service, not production.',
          'Single ordered trials and changed traffic conditions do not prove causation.',
          'The model does not execute experiments; this outcome was checked against real metrics.',
        ],
        cached: false,
      };
      session.reviewed = response;
      return reply.send(response);
    } catch (error) {
      const mapped = mapHypothesisError(error);
      return reply.code(mapped.status).send({ error: 'AI review unavailable', reason: mapped.reason });
    } finally {
      hypothesisBusy = false;
    }
  });

  app.post('/ai/diagnose', async (request, reply) => {
    if (!diagnostician || !demoToken) {
      return reply.code(503).send({ error: 'AI diagnosis is not configured' });
    }
    if (!validBearer(request.headers.authorization, demoToken)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const parsed = diagnosisRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid diagnosis request' });
    }

    const { beforeRunId, afterRunId } = parsed.data;
    const prepared = prepareEvidence(experiments, beforeRunId, afterRunId);
    if (!prepared.ok) {
      return reply.code(prepared.reason === 'not_found' ? 404 : 422).send({
        error: prepared.reason === 'not_found'
          ? 'Run not found'
          : 'Diagnosis requires comparable completed slow/optimized runs with at least 5 samples each',
      });
    }

    const key = beforeRunId + ':' + afterRunId;
    const cached = diagnosisCache.get(key);
    if (cached) return reply.send({ ...cached as object, cached: true });

    // Per-process spend guard. Production requires durable user quotas and identity.
    if (diagnosisActive || Date.now() - lastUncachedDiagnosis < 10000) {
      return reply.code(429).send({ error: 'Diagnosis is busy or cooling down' });
    }
    diagnosisActive = true;
    lastUncachedDiagnosis = Date.now();

    try {
      const { model, finding } = await diagnostician.diagnose(prepared.manifest);
      // Re-check in case an injectable/test implementation bypassed model verification.
      const { verifyDiagnosis } = await import('./ai/diagnostic-evidence.js');
      if (!verifyDiagnosis(prepared.manifest, finding)) {
        return reply.code(502).send({ error: 'AI diagnosis could not be verified' });
      }
      const evidenceSet = new Set(finding.evidenceIds);
      const response = {
        status: 'evidence_backed_hypothesis',
        model,
        beforeRunId,
        afterRunId,
        finding: {
          category: finding.category,
          confidence: finding.confidence,
          explanation: finding.explanation,
          evidenceIds: finding.evidenceIds,
        },
        citedEvidence: prepared.manifest.evidence.filter(({ id }) => evidenceSet.has(id)),
        nextExperiment: { ...finding.nextExperiment, status: 'proposal_only' },
        caveats: [
          'Correlation between variants does not prove a single root cause.',
          'Synthetic Fastify.inject measurements exclude public network latency.',
          'Interpret the finding as a hypothesis, not an established fact.',
        ],
        cached: false,
      };
      diagnosisCache.set(key, response);
      while (diagnosisCache.size > 12) {
        const firstKey = diagnosisCache.keys().next().value;
        if (firstKey) diagnosisCache.delete(firstKey);
      }
      return reply.code(200).send(response);
    } catch (error) {
      if (error instanceof DiagnosticError) {
        const code = error.kind === 'rate_limited' ? 429 : error.kind === 'timeout' ? 504 : 502;
        return reply.code(code).send({ error: 'AI diagnosis unavailable', reason: error.kind });
      }
      request.log.error({ type: 'unexpected_diagnosis_error' }, 'Diagnosis failed');
      return reply.code(502).send({ error: 'AI diagnosis unavailable' });
    } finally {
      diagnosisActive = false;
    }
  });

  return app;
}

