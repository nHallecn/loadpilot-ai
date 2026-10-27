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
    if (request.query.variant === 'slow') {
      // Deliberate head-of-line bottleneck: serialize a simulated data query.
      const operation = serialQueue.then(
        () => new Promise<void>((resolve) => setTimeout(resolve, 80)),
      );
      serialQueue = operation.catch(() => undefined);
      await operation;
    } else {
      // Same logical response, independent short asynchronous work.
      await new Promise<void>((resolve) => setTimeout(resolve, 8));
    }

    return { ok: true, variant: request.query.variant };
  });

  return app;
}
