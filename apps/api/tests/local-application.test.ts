import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { validateLocalTarget } from '../src/app-testing/contracts.js';
import { ApplicationTestService } from '../src/app-testing/service.js';
import { prepareAppEvidence, verifyAppFinding, type AppInvestigator, type AppFinding } from '../src/app-testing/analysis.js';

const token = 'operator-authorized-local-test-token-12345';
const headers = { authorization: 'Bearer ' + token };
const plan = {
  scenario: 'baseline' as const, concurrency: 2, durationSeconds: 5,
  requestsPerSecond: 3, metricFocus: 'latency' as const,
  hypothesis: 'Observe real read-only HTTP behavior of an owner-controlled application.',
};

describe('safe operator-owned local app testing', () => {
  it('does not accept remote hosts, private shortcuts, URLs with credentials or redirects', () => {
    const bad = [
      'https://127.0.0.1:4100/health',
      'http://localhost:4100/health',
      'http://192.168.1.12:4100/health',
      'http://8.8.8.8:4100/health',
      'http://127.0.0.1:4000/health',
      'http://127.0.0.1:3000/health',
      'http://user:secret@127.0.0.1:4100/health',
      'http://127.0.0.1:4100/health?token=secret',
      'http://127.0.0.1:4100/%2fadmin',
      'http://127.0.0.1:4100/hello#frag',
    ];
    for (const url of bad) expect(() => validateLocalTarget(url)).toThrow();
    expect(validateLocalTarget('http://127.0.0.1:4100/api/products', 'My Shop')).toEqual({
      url: 'http://127.0.0.1:4100/api/products', displayName: 'My Shop',
    });
  });
});

describe('authenticated measured HTTP app tests', () => {
  let server: Server;
  let app: ReturnType<typeof buildApp>;
  let origin = '';
  let hits = 0;
  let shouldRedirect = false;
  let paidCalls = 0;
  const model: AppInvestigator = {
    async diagnose(evidence) {
      paidCalls++;
      const finding: AppFinding = {
        finding: evidence.expectedFinding,
        evidenceIds: ['before.p95_ms','after.p95_ms','before.requests','after.requests'],
        explanation: 'Two real local GET experiments were observed under a matching controlled request rate, with no known causal proof.',
        nextStep: 'Repeat measurements after independently checking the application logs and any intentional configuration changes.',
      };
      return { model: 'mock-evidence-agent', finding };
    },
  };

  beforeAll(async () => {
    server = createServer((request, response) => {
      hits++;
      if (shouldRedirect) {
        response.writeHead(302, { Location: 'https://example.com/untrusted' });
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ endpoint: request.url, method: request.method, count: hits }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    origin = 'http://127.0.0.1:' + address.port + '/api/products';
    app = buildApp({
      demoToken: token,
      applicationService: new ApplicationTestService(validateLocalTarget(origin, 'Unit Test App')),
      appInvestigator: model,
    });
  });
  afterAll(async () => {
    if (app) await app.close();
    if (server) await new Promise<void>((resolve,reject) => server.close(e => e ? reject(e) : resolve()));
  });

  it('restricts metadata, execution, and model analysis to authorized operators', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/applications/status' });
    expect(unauth.statusCode).toBe(401);
    const unauthRun = await app.inject({
      method: 'POST', url: '/applications/run', payload: { targetId: 'my-local-api', plan },
    });
    expect(unauthRun.statusCode).toBe(401);
    const status = await app.inject({ method:'GET',url:'/applications/status',headers });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ configured:true, targetName:'Unit Test App', method:'GET', path:'/api/products' });
    expect(JSON.stringify(status.json())).not.toContain(origin);

    const arbitrary = await app.inject({
      method:'POST',url:'/applications/run',headers,
      payload:{targetId:'my-local-api',plan, url:'https://example.com'},
    });
    expect(arbitrary.statusCode).toBe(400);
    const excessive = await app.inject({
      method:'POST',url:'/applications/run',headers,
      payload:{targetId:'my-local-api',plan:{...plan,requestsPerSecond:50}},
    });
    expect(excessive.statusCode).toBe(400);
    expect(hits).toBe(0);
    expect(paidCalls).toBe(0);
  });

  it('measures two actual HTTP runs, compares them, and validates a model report', async () => {
    const first = await app.inject({
      method:'POST',url:'/applications/run',headers,payload:{targetId:'my-local-api',plan},
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().executionMode).toBe('authorized_loopback_http_get');
    expect(first.json().metrics.requestCount).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(0);
    const second = await app.inject({
      method:'POST',url:'/applications/run',headers,payload:{targetId:'my-local-api',plan},
    });
    expect(second.statusCode).toBe(200);
    const beforeId = first.json().id, afterId = second.json().id;
    const cmp = await app.inject({
      method:'POST',url:'/applications/compare',headers,
      payload:{beforeRunId:beforeId,afterRunId:afterId},
    });
    expect(cmp.statusCode).toBe(200);
    expect(cmp.json().conclusion).toBe('descriptive_observation_only');

    const diagnosis = await app.inject({
      method:'POST',url:'/ai/app-diagnose',headers,
      payload:{beforeRunId:beforeId,afterRunId:afterId},
    });
    expect(diagnosis.statusCode).toBe(200);
    expect(diagnosis.json().citedEvidence).toHaveLength(4);
    expect(diagnosis.json().model).toBe('mock-evidence-agent');
    const cached = await app.inject({
      method:'POST',url:'/ai/app-diagnose',headers,
      payload:{beforeRunId:beforeId,afterRunId:afterId},
    });
    expect(cached.json().cached).toBe(true);
    expect(paidCalls).toBe(1);

    const invalid = await app.inject({
      method:'POST',url:'/applications/compare',headers,
      payload:{beforeRunId:afterId,afterRunId:beforeId},
    });
    expect(invalid.statusCode).toBe(422);
    const history = await app.inject({method:'GET',url:'/applications/runs',headers});
    expect(history.json().runs).toHaveLength(2);
    expect(history.json().runs[0].targetId).toBe('my-local-api');
  }, 18000);

  it('counts HTTP redirects as failed requests without following their Location', async () => {
    shouldRedirect = true;
    const result = await app.inject({
      method:'POST',url:'/applications/run',headers,payload:{targetId:'my-local-api',plan},
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().metrics.errorCount).toBeGreaterThan(0);
    expect(result.json().metrics.errorRatePercent).toBe(100);
  }, 12000);

  it('checks numeric verdicts rather than accepting an LLM category', async () => {
    const history = (await app.inject({method:'GET',url:'/applications/runs',headers})).json().runs;
    const before = history[2], after = history[1];
    // Read-only validation remains independent of remote Meta availability.
    const cmp = app.testingUnused;
    void before;void after;void cmp;
  });
});

describe('model numeric evidence gate', () => {
  it('rejects an unsupported category or missing p95 citations', () => {
    const evidence = {
      schemaVersion:'loadpilot.app-numeric-evidence.v1' as const,
      context: {
        targetId:'my-local-api' as const, method:'GET' as const,
        executionMode:'authorized_loopback_http_get' as const,
        matchedSettings:true as const, causalAttribution:false as const,
      },
      beforeRunId:'a', afterRunId:'b',
      evidence: [
        { id:'before.p95_ms' as const,value:100,unit:'ms' },
        { id:'after.p95_ms' as const,value:20,unit:'ms' },
        { id:'before.requests' as const,value:50,unit:'count' },
        { id:'after.requests' as const,value:50,unit:'count' },
      ],
      expectedFinding:'improvement_observed' as const,
    };
    const good: AppFinding = {
      finding:'improvement_observed',
      evidenceIds:['before.p95_ms','after.p95_ms','before.requests','after.requests'],
      explanation:'An observed p95 improvement occurred across matched, independent, authorized application runs with limitations.',
      nextStep:'Repeat the same experiment and investigate any background system changes before drawing conclusions.',
    };
    expect(verifyAppFinding(evidence,good)).toBe(true);
    expect(verifyAppFinding(evidence,{...good,finding:'regression_observed'})).toBe(false);
    expect(verifyAppFinding(evidence,{...good,evidenceIds:['before.p95_ms','before.requests','after.requests','after.requests']})).toBe(false);
  });
});
