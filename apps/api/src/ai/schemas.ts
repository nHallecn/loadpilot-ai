import { z } from 'zod';

export const planRequestSchema = z.object({
  targetId: z.literal('demo-api'),
  objective: z.string().trim().min(10).max(600),
}).strict();

export const testPlanSchema = z.object({
  scenario: z.enum(['baseline', 'spike']),
  concurrency: z.number().int().min(1).max(20),
  durationSeconds: z.number().int().min(5).max(30),
  requestsPerSecond: z.number().int().min(1).max(50),
  metricFocus: z.enum(['latency', 'throughput', 'error_rate']),
  hypothesis: z.string().trim().min(12).max(400),
}).strict();

export type TestPlan = z.infer<typeof testPlanSchema>;
export type PlanRequest = z.infer<typeof planRequestSchema>;

/** Static strict JSON Schema sent to Meta; the Zod schema validates its output again. */
export const metaPlanJsonSchema = {
  type: 'object',
  properties: {
    scenario: { type: 'string', enum: ['baseline', 'spike'] },
    concurrency: { type: 'integer', minimum: 1, maximum: 20 },
    durationSeconds: { type: 'integer', minimum: 5, maximum: 30 },
    requestsPerSecond: { type: 'integer', minimum: 1, maximum: 50 },
    metricFocus: { type: 'string', enum: ['latency', 'throughput', 'error_rate'] },
    hypothesis: { type: 'string' },
  },
  required: [
    'scenario', 'concurrency', 'durationSeconds',
    'requestsPerSecond', 'metricFocus', 'hypothesis',
  ],
  additionalProperties: false,
} as const;
