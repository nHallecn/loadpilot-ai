/**
 * Browser-level integration verification against the real Next.js UI and
 * real Fastify/in-process experiment runner.
 *
 * Only Meta outputs are fixtures; no external model calls or charges.
 * Run after installing tests/browser dependencies:
 *   node tests/browser/e2e.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const artifacts = join(repoRoot, 'tests/browser/artifacts');
await mkdir(artifacts, { recursive: true });

const apiSecret = 'isolated-ci-backend-token-0000000000001';
const uiSecret = 'isolated-ci-dashboard-token-0000000001';
const url = 'http://127.0.0.1:3000';
const processes = [];
let browser;
let page;
const browserDiagnostics = [];

function start(name, command, args, env) {
  const output = createWriteStream(join(artifacts, name + '.log'));
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  child.on('error', error => {
    output.write('\nProcess failed to start: ' + error.message + '\n');
  });
  processes.push(child);
  return child;
}

async function untilHealthy(endpoint, check, label) {
  const end = Date.now() + 120000;
  let lastError;
  while (Date.now() < end) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
      if (response.ok && await check(response)) return;
      lastError = new Error(label + ' is not healthy');
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 900));
  }
  throw new Error('Timed out waiting for ' + label + ': ' + String(lastError));
}

async function gateway(action, payload) {
  const response = await fetch(url + '/api/gateway', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-loadpilot-access': uiSecret },
    body: JSON.stringify({ action, payload }),
  });
  const data = await response.json();
  assert.equal(response.status, 200, action + ': ' + JSON.stringify(data));
  return data;
}

function button(pattern) {
  return page.getByRole('button', { name: pattern });
}

/** React hydration can lag behind Next.js DOMContentLoaded on CI cold starts. */
async function enterAccessKey(key) {
  const field = page.getByLabel('Dashboard access key');
  const connect = button(/^Connect$/);
  for (let attempt = 0; attempt < 15; attempt++) {
    await field.fill(key);
    if (await connect.isEnabled()) return;
    await page.waitForTimeout(350);
  }
  const state = await page.evaluate(() => ({
    readyState: document.readyState,
    passwordValueLength: document.querySelector('input[type=password]')?.value.length ?? -1,
    connectDisabled: [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Connect'))?.disabled,
    scriptsLoaded: [...document.scripts].map(s => s.src).filter(Boolean).length,
  }));
  throw new Error('Dashboard access form did not hydrate: ' + JSON.stringify({ state, browserDiagnostics }));
}
async function checkVisible(locator, label, timeout = 25000) {
  await locator.waitFor({ state: 'visible', timeout });
  console.log('PASS', label);
}

async function flow() {
  // From a clean browser and without using any real user account or credentials.
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => { failures.push(error.message); browserDiagnostics.push('pageerror ' + error.message); });
  page.on('console', msg => { if (msg.type() === 'error') browserDiagnostics.push('console ' + msg.text()); });
  page.on('requestfailed', req => browserDiagnostics.push('request-failed ' + req.url() + ' ' + (req.failure()?.errorText ?? 'unknown')));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await checkVisible(page.getByRole('heading', { name: /AI investigates why your API is slow/ }), 'New evidence-first hero loaded');
  await checkVisible(page.getByRole('heading', { name: 'AI cannot execute tests.' }), 'Model execution boundary is visible');
  await checkVisible(page.locator('.real-http-hero'), 'Local HTTP demo is prominent');
  await checkVisible(page.getByRole('heading', { name: 'Test your API', exact: true }), 'Customer API testing is the primary feature');
  await checkVisible(page.locator('.hero-primary-action'), 'Primary hero action points to application testing');
  assert.equal(await page.locator('.hero-primary-action').getAttribute('href'), '#my-application');

  await checkVisible(page.getByRole('heading', { name: /Try a sample investigation/ }), 'Guided scenario picker visible');
  await checkVisible(page.getByText('SAMPLE TEST FLOW'), 'Schematic of the private demo target is visible');
  await button(/Select hidden-queue investigation/).click();
  assert.equal(await page.locator('#rate').inputValue(), '5');
  assert.equal(await page.locator('#concurrency').inputValue(), '1');
  await button(/Select latency investigation/).click();
  assert.equal(await page.locator('#rate').inputValue(), '20');
  assert.equal(await page.locator('#concurrency').inputValue(), '4');
  console.log('PASS Guided scenario cards update real plan controls');

  await enterAccessKey('wrong-private-test-secret');
  await button(/^Connect$/).click();
  await checkVisible(page.locator('.alert'), 'Invalid access key rejected');
  assert.match(await page.locator('.alert').innerText(), /invalid dashboard access key/i);

  await enterAccessKey(uiSecret);
  await button(/^Connect$/).click();
  await checkVisible(page.getByText('API CONNECTED'), 'Private API connected');

  // New product capability: actual HTTP requests to a separate owner-controlled app.
  await checkVisible(page.getByText('LOCAL APP READY'), 'Operator-authorized local HTTP target is configured');
  await checkVisible(page.getByText('Local Shop API'), 'Local shop app is displayed');
  await button(/^Test my API$/).click();
  await checkVisible(page.locator('.app-measurement').first(), 'True HTTP baseline recorded', 22000);
  const realBefore = await gateway('appHistory');
  assert.ok(realBefore.runs[0].metrics.requestCount > 0);
  assert.equal(realBefore.runs[0].executionMode, 'authorized_loopback_http_get');
  await button(/Run matched follow-up/).click();
  await checkVisible(page.locator('.app-measurement').nth(1), 'Second real HTTP measurement recorded', 22000);
  await checkVisible(page.locator('.app-comparison'), 'Matched real HTTP comparison rendered');
  await button(/Ask Muse to explain the measured change/).click();
  await checkVisible(page.locator('.app-finding'), 'Numeric-verified local app AI finding rendered');
  assert.equal((await gateway('appHistory')).runs.length, 2);
  // The primary judge demo must export actual HTTP source data, not in-process fixtures.
  const httpDownloadEvent = page.waitForEvent('download');
  await button(/Download HTTP evidence JSON/).click();
  const httpDownload = await httpDownloadEvent;
  assert.match(httpDownload.suggestedFilename(), /^loadpilot-http-evidence-[a-f0-9]{8}-[a-f0-9]{8}\.json$/);
  const httpReport = JSON.parse(await readFile(await httpDownload.path(), 'utf8'));
  assert.equal(httpReport.schemaVersion, 'loadpilot.local-http-evidence.v1');
  assert.equal(httpReport.baseline.executionMode, 'authorized_loopback_http_get');
  assert.equal(httpReport.followUp.executionMode, 'authorized_loopback_http_get');
  assert.equal(httpReport.comparison.beforeRunId, httpReport.baseline.id);
  assert.equal(httpReport.comparison.afterRunId, httpReport.followUp.id);
  assert.ok(httpReport.modelInterpretation?.citedEvidence?.length > 0);
  assert.ok(httpReport.limitations.some(value => /causality/i.test(value)));
  assert.ok(!JSON.stringify(httpReport).includes(apiSecret));
  assert.ok(!JSON.stringify(httpReport).includes(uiSecret));
  console.log('PASS Owner-authorized real HTTP tests, verified AI fixture and unsigned JSON evidence export');

  // Live frontend -> Next gateway -> mock Meta planning adapter.
  await button(/Generate plan with Muse Spark/).click();
  await checkVisible(page.getByText('MUSE SPARK PROPOSAL'), 'Validated AI plan displayed');
  assert.match(await page.locator('#experiments').innerText(), /HARD-LIMITED/);

  // Frontend -> real bounded Fastify.inject experiments (no synthetic prefilled metrics).
  await button(/Run both experiments/).click();
  await checkVisible(page.getByText('Observed p95 reduction'), 'Real before/after results displayed', 55000);
  const observed = await gateway('history');
  assert.ok(observed.runs.length >= 2);
  assert.ok(observed.runs.every(r => r.executionMode === 'in_process_fastify_inject'));
  assert.ok(observed.runs.every(r => r.metrics.requestCount > 0));
  console.log('PASS Two real measured runs recorded');

  await button(/Investigate with AI/).click();
  await checkVisible(page.locator('#analysis .finding-tag'), 'Evidence-checked AI diagnosis displayed');
  await checkVisible(page.getByText('Referenced measurements'), 'Cited numeric evidence visible');

  // Four additional bounded, real tests and a deterministic adjudication report.
  await button(/Run confirmation trials/).click();
  await checkVisible(page.locator('#repeatability .repeat-summary'), 'Three-pair report rendered', 90000);
  const download = page.waitForEvent('download');
  await button(/Export evidence JSON/).click();
  const exported = await download;
  const file = exported.suggestedFilename();
  assert.match(file, /^loadpilot-evidence-[a-f0-9]{12}\.json$/);
  const document = JSON.parse(await readFile(await exported.path(), 'utf8'));
  assert.equal(document.manifest.sourceRuns.length, 6);
  assert.equal(document.manifest.summary.pairCount, 3);
  assert.equal(
    createHash('sha256').update(JSON.stringify(document.manifest)).digest('hex'),
    document.integrity.digest,
  );
  console.log('PASS Authentic repeated measurements exported and checksum verified');

  // Controlled low-load initial evidence.
  await button(/Use low-load baseline/).click();
  await checkVisible(page.getByText(/Low-load plan selected/), 'Low load baseline selected');
  await button(/Isolate bottleneck factors/).click();
  await checkVisible(page.locator('#controlled .controlled-conclusion'), 'Controlled contrasts displayed', 80000);
  const baseline = await gateway('history');
  const countBeforeModel = baseline.runs.length;

  await button(/Ask Muse to choose a hypothesis/).click();
  await checkVisible(page.locator('.hypothesis-details'), 'Hypothesis and safe proposal visible');
  assert.match(await page.locator('.hypothesis-details').innerText(), /USER APPROVAL REQUIRED/);
  assert.equal((await gateway('history')).runs.length, countBeforeModel,
    'AI proposal must never execute a run');

  // Explicit user action is needed to start two more measured runs.
  await button(/Approve & run these 2 local tests/).click();
  await checkVisible(page.locator('.retest-measurements>div').nth(1), 'Both authorized retests measured', 65000);
  assert.equal(await page.locator('.retest-measurements>div').count(), 2);

  await button(/Ask Muse to reassess/).click();
  await checkVisible(page.locator('.hypothesis-review'), 'New evidence-based AI verdict displayed');
  assert.ok((await page.locator('.hypothesis-review .evidence-row').count()) >= 4);
  assert.match(await page.locator('.hypothesis-review').innerText(), /Next analytical step/);
  console.log('PASS Full hypothesize → approve → measure → reassess journey');

  // Check the browser has no React/runtime exceptions.
  assert.deepEqual(failures, [], 'Unexpected browser runtime errors: ' + failures.join('; '));
  await page.screenshot({ path: join(artifacts, 'passed-dashboard.png'), fullPage: true });
  console.log('PASS Browser runtime and screenshot captured (AI text fixtures, metrics real)');
}

try {
  start('shop', 'node', ['apps/api/scripts/sample-owned-app.mjs'], {
    SHOP_QUERY_MODE: 'uncached',
  });
  await untilHealthy('http://127.0.0.1:4100/api/products',
    async response => (await response.json()).resultCount === 12, 'Owner-authorized shop API');

  start('api', 'pnpm', ['--filter', '@loadpilot/api', 'exec', 'tsx', 'scripts/e2e-fixture-server.ts'], {
    NODE_ENV: 'test',
    LOADPILOT_E2E: '1',
    LOADPILOT_DEMO_TOKEN: apiSecret,
    MODEL_API_KEY: '',
    LOADPILOT_APP_TEST_URL: 'http://127.0.0.1:4100/api/products',
    LOADPILOT_APP_TEST_NAME: 'Local Shop API',
    LOADPILOT_APP_TEST_CONSENT: 'I_OWN_THIS_LOCAL_API',
  });
  await untilHealthy('http://127.0.0.1:4000/health',
    async response => (await response.json()).service === 'loadpilot-api', 'Fastify API');

  start('web', 'pnpm', ['--filter', '@loadpilot/web', 'exec', 'next', 'start', '--hostname', '127.0.0.1', '--port', '3000'], {
    NODE_ENV: 'production',
    LOADPILOT_API_BASE_URL: 'http://127.0.0.1:4000',
    LOADPILOT_BACKEND_TOKEN: apiSecret,
    DASHBOARD_ACCESS_TOKEN: uiSecret,
  });
  await untilHealthy(url, async response => (await response.text()).includes('loadpilot'),
    'Next.js dashboard');
  await flow();
} catch (error) {
  console.error('FAIL Browser integration:', error);
  console.error('Browser errors and request failures:', browserDiagnostics);
  if (page) {
    await page.screenshot({ path: join(artifacts, 'failed-dashboard.png'), fullPage: true })
      .catch(() => undefined);
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  for (const child of processes.reverse()) {
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* child already stopped */ }
    }
  }
}
