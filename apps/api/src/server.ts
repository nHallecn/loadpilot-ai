import { buildApp } from './app.js';

const port = Number(process.env.API_PORT ?? '4000');
const app = buildApp();

app.listen({ host: '127.0.0.1', port }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
