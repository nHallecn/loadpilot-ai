#!/usr/bin/env node

/**
 * Read-only rehearsal preflight for the local hackathon demonstration.
 *
 * Start with:
 *   cd apps/api
 *   node --env-file=.env scripts/demo-preflight.mjs
 *
 * No AI calls, load tests, secrets, or mutations are performed.
 */

const apiOrigin = 'http://127.0.0.1:4000';
const webOrigin = 'http://127.0.0.1:3000';
const fail = [];
const warn = [];
const pass = [];

async function check(name, operation, mandatory = true) {
  try {
    const detail = await operation();
    pass.push(name + (detail ? ': ' + detail : ''));
    console.log('PASS', name, detail ? '— ' + detail : '');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure';
    const line = name + ': ' + message;
    (mandatory ? fail : warn).push(line);
    console.log(mandatory ? 'FAIL' : 'WARN', line);
  }
}

async function getJson(path) {
  const response = await fetch(apiOrigin + path, {
    method: 'GET',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

console.log('LoadPilot AI — local submission preflight');
console.log('This command makes no paid Meta requests and starts no experiments.');
console.log('');

await check('API credentials present', () => {
  if (!process.env.MODEL_API_KEY?.trim()) {
    throw new Error('MODEL_API_KEY is missing from the API process environment');
  }
  if (!process.env.LOADPILOT_DEMO_TOKEN?.trim()) {
    throw new Error('LOADPILOT_DEMO_TOKEN is missing from the API process environment');
  }
  if (process.env.LOADPILOT_DEMO_TOKEN.length < 24) {
    throw new Error('Please use a long randomly generated demo bearer token (24+ characters)');
  }
  return 'both set; values intentionally hidden';
});

await check('Fastify health endpoint', async () => {
  const body = await getJson('/health');
  if (body.status !== 'ok' || body.service !== 'loadpilot-api') {
    throw new Error('unexpected response shape');
  }
  return 'service responds on loopback port 4000';
});

await check('Muse model connection configured', async () => {
  const body = await getJson('/ai/status');
  if (body.status !== 'configured') {
    throw new Error('API reports disabled; restart Fastify using its private .env file');
  }
  return 'configured (does not spend credits or prove current upstream availability)';
});

// Verify the access gate without sending any credentials or running a workload.
await check('Run endpoint requires authorization', async () => {
  const response = await fetch(apiOrigin + '/experiments/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetId: 'demo-api',
      variant: 'slow',
      plan: {},
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (response.status !== 401) {
    throw new Error('expected 401, received HTTP ' + response.status);
  }
  return 'unauthorized test rejected (no experiment executed)';
});

await check('Next.js dashboard preview', async () => {
  const response = await fetch(webOrigin, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const html = await response.text();
  if (!html.includes('LoadPilot AI') && !html.includes('loadpilot')) {
    throw new Error('unexpected page content');
  }
  return 'web UI responds on local port 3000';
}, false);

console.log('');
console.log('RESULT:', fail.length === 0 ? 'API preflight passed' : fail.length + ' required checks failed');
console.log('Warnings:', warn.length);
console.log('Dashboard gateway and live Meta calls require a separate, private manual check.');
if (fail.length > 0) process.exitCode = 1;
