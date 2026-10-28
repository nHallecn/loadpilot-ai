# LoadPilot AI — Hackathon submission copy

**Status:** submission text ready to edit; video and official portal submission are **not completed**. Replace the bracketed placeholders before submitting. Do not invent a hosted deployment or claim a recorded video exists.

## Submission identity

| Field | Content |
| --- | --- |
| Project name | LoadPilot AI |
| Short tagline | The evidence-first AI performance investigator for developers |
| Working team name | LoadPilot Labs |
| Track | Indie Developer |
| Theme | Push the Frontier |
| Event | Meta Global AI Developer Hackathon 2026 |
| Code | https://github.com/nHallecn/loadpilot-ai |
| Demo video | [Add real video URL after recording and verifying playback] |
| Hosted app | [Optional; do not claim a public deployment unless it works] |
| Participant | [Use your approved participant identity exactly as in the portal] |

**Submission deadline:** November 4, 2026, **9:00 PM Eastern Time**. After the November 1 daylight-saving change this equals November 5, **03:00 Cameroon time (WAT, UTC+1)**. Confirm any deadline changes in the official participant portal.

Official event information: https://dev.meta.ai/events/global-hackathon

## Short pitch (approximately 60 words)

LoadPilot AI turns performance testing into a controlled, evidence-driven investigation. Meta Muse Spark proposes bounded test plans, a separate runner measures actual latency and throughput, and an AI diagnostic agent cites those measurements to suggest testable explanations. The demo includes repeat-trial adjudication and integrity-checkable evidence exports. It is built for developers who need more than a performance chart.

## Main project description — ready to paste and adjust

### Problem

Load-testing tools show that a system has slowed down, but developers still face a difficult gap between *observing* a latency spike and *investigating* it responsibly. AI can help, but a generic chatbot may invent performance evidence or recommend unsafe experiments against arbitrary targets. Developers need a workflow where measured data and deterministic limits remain in charge.

### Our solution

**LoadPilot AI** is an interactive performance investigator built around three clear responsibilities:

1. **Plan:** Meta Muse Spark 1.3 proposes a typed, bounded performance experiment from a developer's question. Independent Zod validation rejects invalid configurations.
2. **Measure:** A deterministic, safety-limited runner tests an authorized, bundled sample API. It records real request durations, p50/p95/p99 latency, observed throughput, errors, and run metadata.
3. **Investigate:** Muse Spark analyzes numeric evidence from completed runs and returns an uncertainty-aware hypothesis, exact evidence references, and a *proposed* next experiment. An independent numeric verifier rejects unsupported conclusion categories or missing citations.

A Next.js dashboard makes the workflow interactive. A repeated-trial module runs three matched slow/optimized pairs under explicit user control, reports descriptive consistency, and exports a JSON evidence manifest with SHA-256 checksum.

### How Meta's model is used

Muse Spark is part of the **runtime product**, not just a code-generation tool. It converts a free-text performance question into a strictly typed experiment proposal and later turns measurements into a structured diagnostic hypothesis. Model output **never executes a test directly**. The application validates plans, authorizes the only demo target, enforces concurrency/duration/rate limits, and verifies diagnostic evidence independently of the model.

A failed model response is an error rather than permission to fabricate results.

### Real example

During a local run on October 27, 2026, the slow demo variant recorded p95 latency of **323.22 ms**, versus **9.56 ms** for the optimized variant. Observed throughput was **12.26 req/s** versus **20.17 req/s**, with zero reported errors. Muse Spark then generated a medium-confidence, evidence-citing `latency_gap_observed` finding and explicitly warned that multiple changed factors prevented a causal conclusion.

**Important:** This is an observed *single* historical run, not a guarantee for future executions. For the submitted recording, show the actual measurements from that recording. Three-pair repeatability results have not been supplied here and must **not** be invented.

### Why this approach matters

Our differentiator is **separation of AI reasoning from experimental authority**. Meta's model may propose plans and explanations; deterministic systems decide what can run and which numeric claims are supported. This makes a more transparent development workflow than simply asking AI to guess the cause of a performance graph.

### What we built during the event

The public repository contains the original TypeScript/pnpm monorepo, Fastify APIs, private in-process demo target, bounded runner, Meta Model API adapters, JSON schema contracts, independent diagnostic verification, Next.js dashboard, repeat-trial assessment, test suite, and documentation. Feature branches, pull requests, CI logs, and `HACKATHON_CONTRIBUTIONS.md` show development provenance.

### Limitations — include these in the final submission

- The demo targets an **in-process Fastify.inject service** only; it does not send traffic to arbitrary websites or measure external network latency.
- The two sample variants change both serialization and simulated work duration. An observed p95 reduction does **not** establish a single causal bottleneck.
- Three trial pairs support only **descriptive repeatability**, not statistical significance. Run order is not randomized.
- The SHA-256 report checksum is **not a cryptographic signature** and does not prove provenance or prevent a malicious checksum replacement.
- Experiment history is **in memory**, lost on backend restart. There is no multi-tenant production authentication, public hosted backend, durable job scheduler, or production load testing.
- AI hypotheses remain hypotheses. They are not verified fixes or production recommendations.

### Tech stack

**Node.js / TypeScript**, **Fastify**, **Next.js / React**, **Zod**, **Vitest**, **pnpm**, **Meta Model API (Muse Spark 1.3)**, and **GitHub Actions CI**.

### AI-assisted development and third-party disclosure

Meta Muse Spark provides runtime test-plan proposals and evidence-constrained diagnostic hypotheses. ChatGPT assisted with architecture, code generation, editing, and testing workflow. The entrant directs product decisions, integrates and reviews the result, supplies credentials privately, and validates the live workflow. Third-party libraries are disclosed in package manifests. A separate distributed load-testing application existed before the event but **its source code and assets were not copied into this project**. This project's work was developed during the hackathon window.

Do not claim human-only source authoring, that the application was independently pentested, that ChatGPT is a runtime dependency, or that the Meta model autonomously runs experiments.

## Additional supporting material

- [README](../README.md) — product overview and setup
- [Hackathon provenance](../HACKATHON_CONTRIBUTIONS.md) — original work and disclosure
- [Dashboard setup](DASHBOARD.md) — private Codespaces walkthrough
- [Experiment runner](EXPERIMENTS.md) — scope, measurements and limits
- [AI diagnosis](DIAGNOSTICS.md) — numeric evidence and oracle
- [Repeatability](REPEATABILITY.md) — three-pair descriptive assessment, checksum limits
- [Recording script](DEMO_SCRIPT.md) — three-minute shot list and narration
- [Final checklist](FINAL_CHECKLIST.md) — preflight, privacy, submission verification

## Submission honesty checklist

Before pasting any claim into the official form, confirm it matches **the commit being submitted**, CI results, the live demo, and the real video. Replace the actual numeric values with those recorded in the final demonstration or explicitly mark them as a prior observed example. Enter the participant, team, demo link, and any optional app URL yourself using the real portal fields.
