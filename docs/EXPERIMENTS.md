# LoadPilot AI: Experimental Engine (Milestone 2)

## What is implemented

- A **private, in-process** Fastify sample service with two versions of one logical endpoint.
- **slow:** intentionally serializes a simulated 80 ms query, creating head-of-line delay.
- **optimized:** uses independent simulated 8 ms asynchronous work.
- A bounded, constant-size worker pool with a shared global request-start rate scheduler.
- Actual observed request durations, p50/p95/p99, mean, min/max, errors and measured throughput.
- Token-protected API routes for running, listing, retrieving, cancelling, and comparing runs.
- In-memory history of the 12 most recent completed/cancelled experiments.

**This is an in-process HTTP-handler benchmark using Fastify.inject, not a network load test of arbitrary URLs.** It measures handler latency and scheduling effects, excluding network and socket overhead. The narrow design eliminates SSRF and unauthorized-target risks.

## Run locally

Node 20+ and pnpm 9+ are required. After pnpm install, from apps/api:

    node --env-file=.env --import tsx src/server.ts

Keep that terminal open. In a second terminal in the same directory:

    node --env-file=.env scripts/demo-experiments.mjs

To generate a plan with Muse Spark first (this uses real API credits):

    node --env-file=.env scripts/demo-experiments.mjs --with-ai

The LOADPILOT_DEMO_TOKEN must be configured on the running server and in the script environment. Never paste or commit the token.

## Endpoints

All experiment routes require Authorization: Bearer <LOADPILOT_DEMO_TOKEN>.

- POST /experiments/run: targetId=demo-api, variant=slow or optimized, plus typed validated plan.
- DELETE /experiments/active: request cancellation of the active run.
- GET /experiments: list up to 12 in-memory run records.
- GET /experiments/:id: retrieve a stored run.
- POST /experiments/compare: beforeRunId and afterRunId as UUIDs.

Run records include ID, UTC timestamp, plan, variant, status and measurements. Comparison provides numeric differences labelled observed, not proof of causation.

## Safety boundaries

- No user URLs, hostnames, routes, ports, headers, or methods are accepted by the runner.
- The private sample application does not bind a TCP listener.
- Deterministic Zod validation (independent of AI): concurrency 1–20, duration 5–30 seconds, global start rate 1–50 requests/s.
- Hard max 500 requests per experiment, one active experiment at a time.
- Cancellation stops new request starts; in-flight in-process requests finish.
- The existing private demo bearer token gates execution; an unset token disables it.
- Logs and model output cannot bypass runner constraints.
- In-memory records disappear at server restart.
- This is not suitable for an Internet-accessible public backend: stronger identity, quotas, persistent storage, and observability are needed.

## Caveats and future work

- Generalized network-based load testing, multi-instance workers, per-request timeouts, distributed scheduling and durable history are not implemented.
- Measured throughput uses wall time including in-flight completion.
- Exact timings depend on host, event loop scheduling and background activity.
- The demonstration variants differ in both serialization and simulated work duration, so the comparison is not a controlled estimate of one change's causal effect.
- Muse currently proposes bounded test plans; evidence-aware AI diagnosis is planned for the next milestone.
- Production requires immutable manifests, durable artifacts, job cancellation and account quotas.
