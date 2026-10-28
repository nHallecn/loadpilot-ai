import { z } from 'zod';
import { testPlanSchema } from '../ai/schemas.js';

export const experimentRequestSchema = z.object({
  targetId: z.literal('demo-api'),
  variant: z.enum(['slow', 'parallel_slow', 'optimized']),
  plan: testPlanSchema,
}).strict();

export const compareRequestSchema = z.object({
  beforeRunId: z.string().uuid(),
  afterRunId: z.string().uuid(),
}).strict();

export type ExperimentRequest = z.infer<typeof experimentRequestSchema>;
export type Variant = ExperimentRequest['variant'];
