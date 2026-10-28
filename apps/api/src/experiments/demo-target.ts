import Fastify from 'fastify';
import type { Variant } from './schemas.js';

/**
 * A private, in-process Fastify application. It never binds to a TCP port, so
 * user input and model output cannot select an Internet/localhost target.
 */
export function createDemoTarget() {
  const app = Fastify({ logger: false });
  let serialQueue: Promise<void> = Promise.resolve();

  app.get<{ Querystring: { variant: Variant } }>('/work', async (request) => {
    const serialized = request.query.variant === 'slow';
    const workDelayMs = request.query.variant === 'optimized' ? 8 : 80;
    if (serialized) {
      // Deliberate head-of-line bottleneck: serialize a simulated data query.
      const operation = serialQueue.then(
        () => new Promise<void>((resolve) => setTimeout(resolve, workDelayMs)),
      );
      serialQueue = operation.catch(() => undefined);
      await operation;
    } else {
      // Same logical response. parallel_slow keeps 80ms work; optimized uses 8ms.
      await new Promise<void>((resolve) => setTimeout(resolve, workDelayMs));
    }

    return { ok: true, variant: request.query.variant };
  });

  return app;
}
