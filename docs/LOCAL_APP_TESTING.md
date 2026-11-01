# LoadPilot AI — Test an application you control

## What this capability changes

Previously LoadPilot only benchmarked its bundled in-process Fastify demo. The new **Test Your API** workflow sends actual, bounded HTTP GET requests to an **owner-selected local application** running on your own computer or Codespace. It records measured p50/p95/p99 latency, requests/second, errors and count. It supports a matched baseline and follow-up, followed by optional evidence-checked Muse Spark interpretation.

**This does not enable arbitrary Internet load testing.** Public HTTPS endpoints, third-party sites, arbitrary request URLs, authentication headers, POST bodies and distributed testing are deliberately out of scope. This is a controlled local-first integration, not production multi-tenant testing.

## Fastest working example: Shop API

1. From a terminal in the repository root, start a separate shop application:

   ```bash
   node apps/api/scripts/sample-owned-app.mjs
   ```

   It binds only to `127.0.0.1:4100`. Check:

   ```bash
   curl http://127.0.0.1:4100/api/products
   ```

   Its `uncached` mode computes real product-ranking work for each request; it does not sleep to simulate slowness. It is still a purpose-built sample application.

2. In **private** `apps/api/.env`, add the following three lines. Preserve your existing `MODEL_API_KEY`, `LOADPILOT_DEMO_TOKEN`, `META_MODEL` and `API_PORT` values:

   ```env
   LOADPILOT_APP_TEST_URL=http://127.0.0.1:4100/api/products
   LOADPILOT_APP_TEST_NAME=Local Shop API
   LOADPILOT_APP_TEST_CONSENT=I_OWN_THIS_LOCAL_API
   ```

   This explicit consent flag is required. Do not commit `.env` or copy any private keys into this document.

3. Restart Fastify in a second terminal:

   ```bash
   cd /workspaces/loadpilot-ai/apps/api
   node --env-file=.env --import tsx src/server.ts
   ```

   Your existing Next.js frontend must remain running in a third terminal, using `apps/web/.env.local` and port 3000.

4. In the **private** port 3000 frontend preview, connect using your separate `DASHBOARD_ACCESS_TOKEN`. Under **Test your API**, the target should display **Local Shop API** and `GET /api/products`. If it says *Not configured*, restart Fastify with the exact three environment variables above, then reload the webpage.

5. Keep the default rate **3 req/s**, **2 workers**, **5 seconds**. Click **Test my API**. The first measured baseline is recorded from actual local HTTP requests.

6. In the first (shop) terminal, stop the Shop API with Ctrl+C; restart it in **cached** mode while keeping LoadPilot/Fastify alive:

   ```bash
   cd /workspaces/loadpilot-ai
   SHOP_QUERY_MODE=cached node apps/api/scripts/sample-owned-app.mjs
   ```

   On Windows PowerShell, use `$env:SHOP_QUERY_MODE='cached'; node apps/api/scripts/sample-owned-app.mjs`.

7. Back in the dashboard click **Run matched follow-up**. See two genuine HTTP latency/throughput measurements and an honest descriptive difference. The frontend shows the same fixed test configuration for both.

8. Optionally click **Ask Muse to explain the measured change**. This uses a real, paid Meta API request and independently validates the model's numeric claim and citations. The model only receives numerical measurements and fixed context, not shop responses, URL, payloads, tokens, or code.

## Connect a different application

Start **your own application** on a non-LoadPilot loopback port, e.g. `127.0.0.1:4100`, with a **non-destructive unauthenticated GET endpoint** under a simple path such as `/health` or `/api/products`.

Then privately update `LOADPILOT_APP_TEST_URL` and `LOADPILOT_APP_TEST_NAME`, confirm `LOADPILOT_APP_TEST_CONSENT=I_OWN_THIS_LOCAL_API`, and restart Fastify. Only the operator sets or changes this URL, never a browser user or AI model.

**Never test an application you do not own or have written authorization to test.** Do not configure login/logout, payment, order, admin, state-changing or expensive side-effect endpoints. Prefer a disposable staging or local development environment.

### Input restrictions and execution limits

| Control | Enforcement |
| --- | --- |
| Target configuration | Backend environment **only**, requires owner consent |
| Network destination | Literal `127.0.0.1` with explicit port 1024–65535, excluding ports 3000/4000 |
| Path | Simple fixed ASCII route, no query/fragment/credentials, no percent escapes or encoded traversal |
| Method | GET only |
| Redirects | Never followed; 3xx counted as failed requests |
| Custom request body/headers | Not supported; adds only `X-LoadPilot-Test: authorized-loopback` |
| Parallel requests | Maximum 4 |
| Request start rate | Maximum 10/second |
| Test duration | 5–10 seconds |
| Maximum starts | 100 per run, by rate × duration (existing runner hard cap 500 still applies) |
| Request timeout | 2 seconds per HTTP call |
| Concurrency between runs | One application test at a time; mutually excludes synthetic runs |
| Result data | Numeric samples/HTTP status success counts; response bodies discarded |
| Security | Private dashboard key + private backend bearer token |
| Meta AI calls | **Only** when explicitly requested; independently verified evidence |

No automatic requests run when a target is configured. Merely viewing status does not request the target. Results remain in memory (up to 12 records); restarting Fastify loses history. A target returning HTTP 404/500 is measured as an error; errors may indicate that the path is wrong, rather than an app slowdown.

### API contracts

All routes use `Authorization: Bearer <LOADPILOT_DEMO_TOKEN>` on private port 4000; the web UI proxies through the same-origin authenticated Next.js gateway.

- `GET /applications/status` — target availability, display name, fixed GET path and hard limits (no secret or full URL)
- `POST /applications/run` — `{"targetId":"my-local-api","plan":{...}}`; plan validated with strict lower caps; **no URL field accepted**
- `GET /applications/runs` — last 12 local HTTP measurements
- `POST /applications/compare` — two distinct, completed, chronological runs with the same plan
- `POST /ai/app-diagnose` — optional paid structured Meta response against two actual runs, numeric evidence verifier
- `DELETE /applications/active` — cancellation signal for new requests and in-flight fetches

### What the finding means

A p95 improvement after restarting the Shop API in cached mode is a **measured association under a manually controlled change**, not a randomized causal result. A single before/after pair can be affected by CPU contention, startup warming, timing and other factors. Muse may suggest further investigation, but it cannot inspect code or automatically attribute the improvement to a specific line or query.

### What is still missing

The next production-oriented stage would allow **verified remote staging application targets**, using domain ownership proof, destination allowlists, DNS/IP pinning, strong SSRF controls, cancellation, explicit resource budgets, audit logs and organization-level quotas. None of that is claimed to be implemented here. Do not deploy the local-only tester as a general public load-testing service.
