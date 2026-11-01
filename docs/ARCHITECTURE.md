# LoadPilot AI — Implemented architecture (hackathon MVP)

This describes **the implemented local-first prototype**, not a proposed future architecture. LoadPilot has two different testing workflows: (1) a real owner-approved loopback HTTP endpoint, which is the headline demo; (2) a bundled in-process Fastify.inject sample, which is the secondary investigation sandbox.

```text
Browser / Next.js dashboard
  └─ POST /api/gateway  [independent private dashboard token; fixed operation allowlist]
       └─ Fastify API on localhost:4000 [separate backend bearer token]
            ├─ /applications/status → owner-configured local target metadata
            ├─ /applications/run → validated plan → bounded GET runner
            │                                     └─ exactly configured 127.0.0.1 port/path
            ├─ /applications/compare → deterministic matched-run comparison
            ├─ /ai/app-diagnose → Meta Model API → numeric citation verifier
            ├─ /experiments/run → bounded in-process sample (Fastify.inject)
            ├─ /experiments/compare, /adjudicate, /investigations/controlled
            └─ /ai/plan, /diagnose, /hypotheses, /reassess
                 └─ typed proposals and evidence checks; no execution authority
```

## Primary: real local HTTP investigation

1. **Consent/allowlist:** Fastify operator privately sets a fixed loopback GET endpoint and explicit ownership consent in `apps/api/.env`; neither model nor browser may select a target URL.
2. **Before:** an explicit button click triggers bounded HTTP GET requests to a separate owner-controlled local service, returning real p50, p95, p99, request counts, throughput and error rates.
3. **Investigation:** a person inspects the baseline, their own application and the hypothesis; they manually make a change. No automatic code changes, deployments or additional tests occur.
4. **Matched follow-up:** a second explicit button click executes the same settings. The backend returns a deterministic, descriptive comparison of completed runs.
5. **Optional AI explanation:** *after* both runs, the person can explicitly request a paid Meta model interpretation of selected numerical evidence. Independent validation checks cited values and conclusions. No inference of proven root cause is justified.
6. **Evidence download:** the browser exports the local run objects, comparison, optional AI observation and limitations in JSON. **This local HTTP report has no cryptographic signature/checksum.** A separate repeated-trial in-process report provides a manifest SHA-256 checksum (not authentication).

Details: [LOCAL_APP_TESTING.md](LOCAL_APP_TESTING.md).

## Enforced boundaries

| Boundary | Implemented behavior |
| --- | --- |
| Browser ↔ Next.js | Dashboard token, checked server-side; UI key kept only in tab memory |
| Next.js ↔ Fastify | Fixed action table and private bearer token; no dynamic URL proxy |
| Owner ↔ HTTP target | Fixed backend environment configuration + consent, literal `127.0.0.1` only, explicit high port, read-only GET, no redirects, custom body or arbitrary headers |
| Local HTTP budget | Up to 10 request starts/s, 4 workers, 10 seconds, 100 total starts, 2-second HTTP timeout, one active experiment at a time |
| AI ↔ execution | **AI cannot execute tests.** Typed proposals are not commands; the deterministic gate, operator consent and explicit user click govern execution |
| AI ↔ data | Numeric evidence is sent for local app diagnosis, not URL, response bodies, source code or credentials |
| Storage | In-memory recent records only (last 12 local runs); process restarts/eviction erase history, so download promptly |

The bundled in-process sample has its **own** separately enforced caps and is not governed by the lower real HTTP limits. Model requests consume credits only when separately invoked.

## Secondary: bundled sample experimentation

The in-process Fastify.inject target runs intentional `slow`, `parallel_slow`, `optimized` variants. It supports contrasts, repeat trials, typed model hypotheses and user-approved follow-up runs. Such metrics exclude real socket overhead and cannot determine public production capacity. Its checksum-bearing report is a serialized-data integrity check, **not** a signed attestation.

## Limits and future work

This is **not** a publicly hosted, multi-tenant load-testing platform. It lacks remote target ownership proof, arbitrary staging host support, hardened DNS/IP/SSRF controls for Internet hosts, organization accounts, persistent history, audit logs, distributed workers and statistical causal attribution. Do not infer production scale, autonomous debugging or production security from the demo.

Previously proposed implementation phases (scaffold, policy gate, runner, measurements, model interpretation, UI) now have working local-first implementations. See [README](../README.md), [DEMO_SCRIPT.md](DEMO_SCRIPT.md), and [HACKATHON_CONTRIBUTIONS.md](../HACKATHON_CONTRIBUTIONS.md).
