import { z } from 'zod';
import { testPlanSchema } from '../ai/schemas.js';

/** Application test plans are intentionally far below the synthetic demo caps. */
export const appPlanSchema = testPlanSchema.refine(
  p => p.scenario === 'baseline' &&
    p.concurrency <= 4 && p.requestsPerSecond <= 10 && p.durationSeconds <= 10,
  'Local application tests allow baseline only, up to 4 workers, 10 req/s and 10 seconds',
);

export const appRunRequestSchema = z.object({
  targetId: z.literal('my-local-api'),
  plan: appPlanSchema,
}).strict();

export const appCompareRequestSchema = z.object({
  beforeRunId: z.string().uuid(),
  afterRunId: z.string().uuid(),
}).strict();

export type AppRunRequest = z.infer<typeof appRunRequestSchema>;

export type LocalTargetConfig = {
  displayName: string;
  /** Operator-owned loopback GET endpoint. Never accepted from browser/model input. */
  url: string;
};

/**
 * Refuse DNS, remote addresses, redirects, query secrets and user-controlled URLs.
 * A developer must start their application locally and opt in via private env.
 */
export function validateLocalTarget(rawUrl: string, displayName = 'My local API'): LocalTargetConfig {
  const url = new URL(rawUrl);
  if (
    url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
    !url.port || Number(url.port) < 1024 || Number(url.port) > 65535 ||
    [3000, 4000].includes(Number(url.port)) ||
    url.username || url.password || url.search || url.hash ||
    !/^\/[a-zA-Z0-9/_-]{0,120}$/.test(url.pathname) ||
    url.pathname.includes('//') || url.pathname.includes('..') ||
    url.toString() !== rawUrl
  ) {
    throw new Error('Target must be a loopback HTTP GET endpoint on an explicit non-LoadPilot port with a simple path');
  }
  if (!/^[a-zA-Z0-9 _.-]{1,48}$/.test(displayName)) {
    throw new Error('Invalid local app display name');
  }
  return { url: rawUrl, displayName };
}
