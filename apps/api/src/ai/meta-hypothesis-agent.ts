import { z } from 'zod';
import {
  proposalSchema, reassessmentSchema,
  type HypothesisProposal, type HypothesisReassessment,
  type InitialEvidence, type FollowUpEvidence,
} from './hypothesis-evidence.js';

export interface HypothesisAgent {
  propose(evidence: InitialEvidence): Promise<{ model: string; proposal: HypothesisProposal }>;
  reassess(evidence: FollowUpEvidence): Promise<{ model: string; assessment: HypothesisReassessment }>;
}

export class HypothesisAgentError extends Error {
  constructor(readonly kind: 'rate_limited' | 'timeout' | 'upstream' | 'invalid_response') {
    super(kind);
    this.name = 'HypothesisAgentError';
  }
}

const choiceEnvelope = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable() }),
  })).min(1),
}).passthrough();

const proposalFormat = {
  type: 'object', additionalProperties: false,
  properties: {
    hypothesis: { type: 'string', enum: ['serialization_overhead', 'processing_delay'] },
    initialSignal: { type: 'string', enum: [
      'observed_at_demo_threshold', 'not_observed_at_demo_threshold', 'error_regression',
    ] },
    evidenceIds: {
      type: 'array', minItems: 2, maxItems: 6,
      items: { type: 'string', enum: [
        'serialization.before_p95_ms', 'serialization.after_p95_ms',
        'serialization.before_requests', 'serialization.after_requests',
        'serialization.before_error_percent', 'serialization.after_error_percent',
        'processing.before_p95_ms', 'processing.after_p95_ms',
        'processing.before_requests', 'processing.after_requests',
        'processing.before_error_percent', 'processing.after_error_percent',
      ] },
    },
    rationale: { type: 'string' },
    followUpAction: { type: 'string', enum: [
      'probe_serialization_high_load','repeat_serialization','repeat_processing',
    ] },
    whyThisTest: { type: 'string' },
  },
  required: ['hypothesis','initialSignal','evidenceIds','rationale','followUpAction','whyThisTest'],
} as const;

const reassessmentFormat = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: [
      'replicated_signal','load_dependent_signal_observed',
      'inconsistent_signal','still_inconclusive',
    ] },
    evidenceIds: {
      type: 'array', minItems: 4, maxItems: 8,
      items: { type: 'string', enum: [
        'initial.before_p95_ms','initial.after_p95_ms',
        'followup.before_p95_ms','followup.after_p95_ms',
        'initial.before_requests','initial.after_requests',
        'followup.before_requests','followup.after_requests',
      ] },
    },
    explanation: { type: 'string' },
    nextStep: { type: 'string' },
  },
  required: ['verdict','evidenceIds','explanation','nextStep'],
} as const;

type Options = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/** Server-only Meta integration. Neither task provides executable URLs or credentials. */
export function createMetaHypothesisAgent({
  apiKey,
  model = 'muse-spark-1.3',
  fetchImpl = fetch,
  timeoutMs = 30000,
  sleep = ms => new Promise<void>(resolve => setTimeout(resolve, ms)),
}: Options): HypothesisAgent {
  if (!apiKey.trim()) throw new Error('MODEL_API_KEY is required');
  async function complete<T>(
    instruction: string,
    evidence: InitialEvidence | FollowUpEvidence,
    format: typeof proposalFormat | typeof reassessmentFormat,
    parse: (value: unknown) => T,
  ): Promise<T> {
    const payload = {
      model,
      messages: [
        { role: 'developer', content: instruction },
        { role: 'user', content: JSON.stringify(evidence) },
      ],
      reasoning_effort: 'low',
      max_completion_tokens: 4096,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'loadpilot_hypothesis_v1', strict: true, schema: format },
      },
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetchImpl('https://api.meta.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timeout = error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TimeoutError');
        if (timeout && attempt === 0) { await sleep(350); continue; }
        throw new HypothesisAgentError(timeout ? 'timeout' : 'upstream');
      }
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt === 0) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(2000, retryAfter * 1000) : 350);
          continue;
        }
        throw new HypothesisAgentError(response.status === 429 ? 'rate_limited' : 'upstream');
      }
      try {
        const envelope = choiceEnvelope.parse(await response.json());
        const content = envelope.choices[0].message.content;
        if (!content) throw new Error('Empty');
        return parse(JSON.parse(content));
      } catch {
        throw new HypothesisAgentError('invalid_response');
      }
    }
    throw new HypothesisAgentError('upstream');
  }

  return {
    async propose(evidence) {
      const preferred = evidence.hypotheses.find(h => h.id === 'serialization_overhead');
      const lowLoad = evidence.load.concurrency <= 2 && evidence.load.requestsPerSecond <= 10;
      const prompt =
        'You are an evidence-first performance investigator. The input contains only measured numbers from a controlled synthetic three-variant study. ' +
        'Choose one hypothesis and cite exact numeric evidence IDs for that hypothesis, including its before/after p95. ' +
        'initialSignal MUST exactly match the cited hypothesis signal. ' +
        'Choose a bounded follow-up action: repeat_serialization for serialization_overhead, repeat_processing for processing_delay; ' +
        'or probe_serialization_high_load ONLY for serialization_overhead when initialSignal=not_observed_at_demo_threshold ' +
        'AND original concurrency<=2 AND original requestsPerSecond<=10. ' +
        'If low load hides a serialization signal, prefer probe_serialization_high_load to test whether queueing appears at higher load. ' +
        'When observed results are ambiguous, say so; never assert causal proof or statistical significance. ' +
        'No URLs, commands, arbitrary parameters or automatic execution. Mention only evidence in the input. ' +
        'This is a user-authorized proposal; no experiment should be run by you.' +
        (lowLoad && preferred?.signal === 'not_observed_at_demo_threshold'
          ? ' The high-load serialization probe is an informative next experiment for the currently unobserved serialization signal.'
          : '');
      const proposal = await complete(prompt, evidence, proposalFormat, value => proposalSchema.parse(value));
      return { model, proposal };
    },
    async reassess(evidence) {
      const prompt =
        'You are LoadPilot reviewing actual new numeric measurements following a user-authorized retest. ' +
        'The supplied evidence contains a required deterministic expectedVerdict. ' +
        'Your verdict MUST equal expectedVerdict and cite all four initial/followup p95 evidence IDs. ' +
        'Explain how the follow-up changes or limits the initial hypothesis, distinguishing ' +
        'replicated_signal, load_dependent_signal_observed, inconsistent_signal and still_inconclusive. ' +
        'In a load-dependent case, explain that changing the common traffic conditions can reveal a serialization gap; ' +
        'within EACH pair only one synthetic factor changed. ' +
        'The study is not randomized or statistically significant, and excludes network latency. ' +
        'No fabricated metrics, claims of production causation, shell commands, credentials or URLs. ' +
        'Propose a bounded next analysis idea in words only, never execute a test.';
      const assessment = await complete(prompt, evidence, reassessmentFormat, value => reassessmentSchema.parse(value));
      return { model, assessment };
    },
  };
}
