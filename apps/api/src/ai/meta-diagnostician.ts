import { z } from 'zod';
import {
  diagnosisJsonSchema,
  diagnosisOutputSchema,
  verifyDiagnosis,
  type DiagnosisManifest,
  type DiagnosisOutput,
} from './diagnostic-evidence.js';

const envelopeSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable() }),
  })).min(1),
}).passthrough();

export type DiagnosticResult = {
  model: string;
  finding: DiagnosisOutput;
};

export interface Diagnostician {
  diagnose(manifest: DiagnosisManifest): Promise<DiagnosticResult>;
}

export type DiagnosticErrorKind = 'rate_limited' | 'timeout' | 'upstream' | 'invalid_response';

export class DiagnosticError extends Error {
  constructor(readonly kind: DiagnosticErrorKind) {
    super(kind);
    this.name = 'DiagnosticError';
  }
}

type Options = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const endpoint = 'https://api.meta.ai/v1/chat/completions';

/**
 * Generate an evidence-citing hypothesis without passing raw request bodies,
 * credentials, source code, or potentially sensitive application logs to Meta.
 */
export function createMetaDiagnostician({
  apiKey,
  model = 'muse-spark-1.3',
  fetchImpl = fetch,
  timeoutMs = 30000,
  sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: Options): Diagnostician {
  if (!apiKey.trim()) throw new Error('MODEL_API_KEY is required');

  return {
    async diagnose(manifest) {
      const payload = {
        model,
        messages: [
          {
            role: 'developer',
            content:
              'You are LoadPilot, an evidence-first performance investigator. ' +
              'Analyze only the numeric evidence in the provided manifest. ' +
              'Every finding must cite before.p95_latency_ms and after.p95_latency_ms ' +
              'plus any additional evidence IDs that substantiate the conclusion. ' +
              'Only use evidence IDs present in the manifest, with no duplicates. ' +
              'These are in-process demo measurements, NOT production/network timings. ' +
              'The slow and optimized variants differ in both serialization and delay; ' +
              'observations cannot establish that one factor caused the difference. ' +
              'Use low confidence unless at least ten samples in each run show a p95 reduction ' +
              'of at least 20% and 10ms. Only select possible_serialization_bottleneck ' +
              'if those same conditions hold; phrase it as a hypothesis, never proof. ' +
              'Use no_clear_latency_gap only for gaps below 10ms or 10%. ' +
              'If data are weak, choose inconclusive. ' +
              'Recommend a bounded follow-up experiment as a proposal, not an action. ' +
              'Do not invent facts, specific numeric values or source code. ' +
              'Never include commands, URLs, credentials, or production recommendations.',
          },
          {
            role: 'user',
            content: 'Diagnose this numeric-only experiment manifest: ' + JSON.stringify(manifest),
          },
        ],
        reasoning_effort: 'low',
        max_completion_tokens: 4096,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'loadpilot_diagnosis_v1',
            strict: true,
            schema: diagnosisJsonSchema,
          },
        },
      };

      for (let attempt = 0; attempt < 2; attempt++) {
        let response: Response;
        try {
          response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (error) {
          const isTimeout = error instanceof Error &&
            (error.name === 'AbortError' || error.name === 'TimeoutError');
          if (isTimeout && attempt === 0) {
            await sleep(350);
            continue;
          }
          throw new DiagnosticError(isTimeout ? 'timeout' : 'upstream');
        }

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt === 0) {
            const retryAfter = Number(response.headers.get('retry-after'));
            await sleep(
              Number.isFinite(retryAfter) && retryAfter > 0
                ? Math.min(retryAfter * 1000, 2000)
                : 350,
            );
            continue;
          }
          throw new DiagnosticError(response.status === 429 ? 'rate_limited' : 'upstream');
        }

        try {
          const envelope = envelopeSchema.parse(await response.json());
          const text = envelope.choices[0].message.content;
          if (!text) throw new Error('Empty diagnosis');
          const finding = diagnosisOutputSchema.parse(JSON.parse(text));
          if (!verifyDiagnosis(manifest, finding)) throw new Error('Unsupported evidence claim');
          return { model, finding };
        } catch {
          throw new DiagnosticError('invalid_response');
        }
      }
      throw new DiagnosticError('upstream');
    },
  };
}
