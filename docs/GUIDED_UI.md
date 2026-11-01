# LoadPilot — Guided Demo Interface

## Why the UI changed

Previously, the homepage began with a technical control panel and empty metrics. A first-time judge had to scroll down to discover the actual product story and most controls were disabled without a backend connection.

The updated page introduces the workflow before asking the visitor to operate it:

1. **AI investigates why your API is slow. Measured evidence, not guesses.** — real owner-authorized HTTP baseline → manual investigation → matched follow-up as the headline story; an explicit AI execution safety boundary is visible.
2. **Test your local API first.** The owner-configured GET target is measured over actual HTTP and the before/after run pair can be exported as an unsigned JSON snapshot. **Optional** sample cards below still let developers explore in-process variants; selection does not start traffic.
3. **Understand the steps.** Four concise blocks: ask, measure, compare, investigate.
4. **Connect once.** The dashboard unlock panel explains which private access token is needed, and never requests the Meta credential.
5. **Run and see evidence.** The existing experiment, AI diagnostic, factor-isolation, repeat-trial and history sections remain available without breaking their contracts.

The **hero preview** is an explanatory, number-free illustration of the real HTTP workflow. The separate optional sample experiment schematic uses actual p95 values only after measured in-process runs; animated dots appear only during those sample experiments. Neither illustration invents test results.

## Scenario cards

| Scenario | Request rate | Concurrency | Duration | Intended use |
| --- | --- | --- | --- | --- |
| Why is my API slow? | 20 req/s | 4 workers | 5 seconds | Slow/optimized latency comparison |
| What bottleneck is hiding? | 5 req/s | 1 worker | 5 seconds | Low-load controlled factors, then optional high-load hypothesis retest |

**These optional scenario-card experiments** remain restricted to the bundled in-process `demo-api`. The primary Test Your API section instead uses an owner-approved, bounded localhost HTTP GET endpoint. The cards do not change either runner's safety limits. The low-load preset does not guarantee a particular measured outcome.

## Primary real-HTTP demonstration

Follow [LOCAL_APP_TESTING.md](LOCAL_APP_TESTING.md) to configure the owner-consented local Shop API. In the dashboard run **Test my API** (baseline), inspect actual metrics, manually switch the Shop API to cached mode, run **Run matched follow-up**, optionally request paid Muse interpretation, and click **Download HTTP evidence JSON**. This export is an unsigned measurement snapshot. No API request is initiated by the AI.

## Optional sample demo: manual Codespaces test

First ensure `apps/api/.env` holds the private Meta credential and `LOADPILOT_DEMO_TOKEN`. The frontend server's `apps/web/.env.local` must include:

    LOADPILOT_API_BASE_URL=http://127.0.0.1:4000
    LOADPILOT_BACKEND_TOKEN=<same value as LOADPILOT_DEMO_TOKEN>
    DASHBOARD_ACCESS_TOKEN=<separate random secret at least 24 characters>

Keep both files private and do not commit them.

Terminal 1:

    cd /workspaces/loadpilot-ai/apps/api
    node --env-file=.env --import tsx src/server.ts

Terminal 2:

    cd /workspaces/loadpilot-ai/apps/web
    pnpm dev

Open the private Codespaces preview for port 3000. Select either scenario **even before connecting**, then enter the `DASHBOARD_ACCESS_TOKEN` in the Connect panel. The status should read **API CONNECTED**.

1. Select **Why is my API slow?** and confirm it populates concurrency 4, rate 20 req/s and duration 5 seconds.
2. Click **Run both experiments** and inspect real p95 values both in the results section and the system schematic.
3. Click **Investigate with AI** only if you want to spend Meta Model API credits.
4. Select **What bottleneck is hiding?** and confirm concurrency 1, rate 5 req/s and duration 5 seconds.
5. Click **Isolate bottleneck factors** (no Meta credits); inspect the three controlled variants.
6. Optionally request a paid Muse hypothesis, approve two new bounded experiments, and request a second paid evidence reassessment.
7. Confirm the user-facing caveats remain visible: synthetic API, in-process measurements, descriptive not causal proof.

If the page says **NOT CONNECTED**, check the Fastify server, Next.js server, `LOADPILOT_BACKEND_TOKEN`, `DASHBOARD_ACCESS_TOKEN` and whether the forwarded port is private. The hosted Vercel shell cannot connect to a private Codespace backend automatically.

## Automated regression test

GitHub Actions Chromium tests verify that both new scenario buttons update the underlying test parameters. Existing tests continue to verify gateway authentication, real in-process runs, latency comparison, AI response fixtures, export checksums and controlled follow-ups.

**CI model responses are fixtures**, not a real Muse Spark demonstration. The final video must show real Meta responses recorded in the user's private Codespace.
