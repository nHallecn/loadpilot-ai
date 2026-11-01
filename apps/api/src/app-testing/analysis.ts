import { z } from 'zod';
import type { ApplicationComparison, ApplicationRun } from './service.js';

export const analysisRequestSchema = z.object({
  beforeRunId: z.string().uuid(),
  afterRunId: z.string().uuid(),
}).strict();

const ids = [
  'before.p95_ms', 'after.p95_ms',
  'before.requests', 'after.requests',
  'before.error_rate_percent', 'after.error_rate_percent',
  'before.throughput_rps', 'after.throughput_rps',
] as const;
const findingTypes = [
  'regression_observed', 'improvement_observed', 'no_clear_change', 'inconclusive_errors',
] as const;
export const appFindingSchema = z.object({
  finding: z.enum(findingTypes),
  evidenceIds: z.array(z.enum(ids)).min(4).max(8),
  explanation: z.string().trim().min(45).max(400),
  nextStep: z.string().trim().min(30).max(250),
}).strict();
export type AppFinding = z.infer<typeof appFindingSchema>;

export type AppEvidence = {
  schemaVersion: 'loadpilot.app-numeric-evidence.v1';
  context: {
    targetId: 'my-local-api';
    method: 'GET';
    executionMode: 'authorized_loopback_http_get';
    matchedSettings: true;
    causalAttribution: false;
  };
  beforeRunId: string;
  afterRunId: string;
  evidence: Array<{ id: typeof ids[number]; value: number; unit: string }>;
  expectedFinding: typeof findingTypes[number];
};

export function prepareAppEvidence(before: ApplicationRun, after: ApplicationRun, comparison: ApplicationComparison): AppEvidence {
  const b = before.metrics, a = after.metrics;
  const expectedFinding: AppEvidence['expectedFinding'] =
    b.errorRatePercent > 0 || a.errorRatePercent > 0
      ? 'inconclusive_errors'
      : comparison.p95DeltaMs >= 10 && comparison.p95DeltaMs / Math.max(b.latencyMs.p95, .001) >= .20
        ? 'regression_observed'
        : comparison.p95DeltaMs <= -10 && -comparison.p95DeltaMs / Math.max(b.latencyMs.p95, .001) >= .20
          ? 'improvement_observed' : 'no_clear_change';
  return {
    schemaVersion: 'loadpilot.app-numeric-evidence.v1',
    context: {
      targetId: 'my-local-api',
      method: 'GET',
      executionMode: 'authorized_loopback_http_get',
      matchedSettings: true,
      causalAttribution: false,
    },
    beforeRunId: before.id,
    afterRunId: after.id,
    evidence: [
      { id: 'before.p95_ms', value: b.latencyMs.p95, unit: 'ms' },
      { id: 'after.p95_ms', value: a.latencyMs.p95, unit: 'ms' },
      { id: 'before.requests', value: b.requestCount, unit: 'count' },
      { id: 'after.requests', value: a.requestCount, unit: 'count' },
      { id: 'before.error_rate_percent', value: b.errorRatePercent, unit: 'percent' },
      { id: 'after.error_rate_percent', value: a.errorRatePercent, unit: 'percent' },
      { id: 'before.throughput_rps', value: b.observedRps, unit: 'req/s' },
      { id: 'after.throughput_rps', value: a.observedRps, unit: 'req/s' },
    ],
    expectedFinding,
  };
}

export function verifyAppFinding(data: AppEvidence, suggestion: AppFinding) {
  const given = new Set(suggestion.evidenceIds);
  return suggestion.finding === data.expectedFinding &&
    given.size === suggestion.evidenceIds.length &&
    ['before.p95_ms','after.p95_ms','before.requests','after.requests'].every(id => given.has(id as typeof ids[number])) &&
    suggestion.evidenceIds.every(id => data.evidence.some(e => e.id === id));
}

export interface AppInvestigator {
  diagnose(evidence: AppEvidence): Promise<{ model: string; finding: AppFinding }>;
}

export function createMetaAppInvestigator({
  apiKey, model = 'muse-spark-1.3', fetchImpl = fetch,
}: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): AppInvestigator {
  if (!apiKey.trim()) throw new Error('MODEL_API_KEY is required');
  return {
    async diagnose(evidence) {
      const outputSchema = {
        type: 'object', additionalProperties: false,
        properties: {
          finding: { type: 'string', enum: findingTypes },
          evidenceIds: { type: 'array', minItems: 4, maxItems: 8, items: { type: 'string', enum: ids } },
          explanation: { type: 'string' },
          nextStep: { type: 'string' },
        },
        required: ['finding','evidenceIds','explanation','nextStep'],
      };
      let response: Response;
      try {
        response = await fetchImpl('https://api.meta.ai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            model, reasoning_effort: 'low', max_completion_tokens: 2048,
            messages: [
              {
                role: 'developer',
                content:
                  'You are an evidence-first application API investigator. You have two measured HTTP GET runs on an authorized local service. ' +
                  'Never infer specific source-code defects, SQL queries, optimizations, or production performance. ' +
                  'The input supplies an expectedFinding derived from independently checked numerical thresholds. ' +
                  'Your finding MUST equal expectedFinding. Cite both p95 values and both request counts, plus other observed numbers if useful. ' +
                  'This is a descriptive comparison of two separately executed trials with no randomized control. ' +
                  'Say what the measurements show, where uncertainty remains, and suggest a safe, owner-approved follow-up in plain English. ' +
                  'Do not invent causes, locations, timestamps, credentials, HTTP endpoints, commands or claims of causal proof.',
              },
              { role: 'user', content: JSON.stringify(evidence) },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'loadpilot_local_app_analysis_v1', strict: true, schema: outputSchema },
            },
          }),
        });
      } catch {
        throw new Error('Model API request could not complete');
      }
      if (!response.ok) throw new Error(response.status === 429 ? 'Model rate limited' : 'Model upstream error');
      try {
        const envelope = z.object({
          choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
        }).passthrough().parse(await response.json());
        const text = envelope.choices[0].message.content;
        const result = appFindingSchema.parse(JSON.parse(text ?? ''));
        if (!verifyAppFinding(evidence, result)) throw new Error('Contradictory numerical finding');
        return { model, finding: result };
      } catch {
        throw new Error('Model response failed evidence validation');
      }
    },
  };
}
