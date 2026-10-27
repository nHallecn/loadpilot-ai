# LoadPilot AI

**Autonomous Software Performance Investigator**  
Meta Global AI Developer Hackathon 2026 · Indie Developer · Push the Frontier

> Status: **Meta Muse Spark test-plan proposals and the in-process bounded experimental runner are implemented.** The sample service supports measured slow/optimized comparisons. A schema-validated, evidence-citing **AI diagnosis endpoint** is implemented on a feature branch. Persistent storage and the interactive testing dashboard are **not yet implemented**. All new project code is authored during the October 26–November 4, 2026 hackathon.

## The problem

Conventional load-testing tools report latency, throughput and errors, but developers still need to investigate *why* a service slows down. LoadPilot AI aims to use evidence-driven AI to plan safe experiments, interpret real measurements and guide validated follow-up tests.

## Proposed demo outcome

Given an **authorized local sample API with an intentional performance bottleneck**, LoadPilot AI should:
1. Convert a developer goal into a structured, safety-checked test plan.
2. Run a bounded performance experiment.
3. Collect and preserve latency, throughput, error counts and diagnostic evidence.
4. Use **Meta Model API** to formulate a cited, uncertainty-aware hypothesis.
5. Compare the baseline with a controlled retest following a proposed optimization.

No arbitrary Internet-target load testing. No claim of an improvement without supporting measurements.

## Repository layout

```text
apps/
  api/      Fastify TypeScript API; health endpoint and protected AI plan route
  web/      Next.js dashboard scaffold

docs/
  MVP.md           Scope and acceptance criteria
  ARCHITECTURE.md  Planned components and trust boundaries
  META_MODEL_API.md Server-side Meta planner setup and security constraints
  EXPERIMENTS.md    Local benchmark and comparison walkthrough
  DIAGNOSTICS.md    Evidence-citing Meta AI diagnosis and independent verification
HACKATHON_CONTRIBUTIONS.md  Evidence log and third-party disclosure
```

## Local development

Prerequisites: Node.js 20+ and pnpm 9+.

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:3000
- API health: http://localhost:4000/health
- API readiness: http://localhost:4000/ai/status
- AI plan proposal: POST http://localhost:4000/ai/plan (private bearer token required)
- Run local experiment: POST http://localhost:4000/experiments/run (private bearer token required)
- Retrieve history: GET http://localhost:4000/experiments
- Compare two runs: POST http://localhost:4000/experiments/compare
- Diagnose compatible runs: POST http://localhost:4000/ai/diagnose (private bearer token required)
- Run tests: `pnpm test`
- Typecheck: `pnpm typecheck`

To activate Meta Model API locally, **export** `MODEL_API_KEY` and a strong random `LOADPILOT_DEMO_TOKEN` in the API server's environment. The starter does not auto-load `.env`; copying `.env.example` alone is insufficient. See [Meta Model API setup](docs/META_MODEL_API.md) for a tested-request example. Never commit API keys, expose them through `NEXT_PUBLIC_*`, or publish the Fastify demo API without stronger authentication and persistent rate limits.

The model issues **proposals only**; a separate deterministic runner executes only the bundled in-process demo API, and never loads user-supplied URLs. Run `node --env-file=.env scripts/demo-experiments.mjs` from `apps/api` to compare slow and optimized variants; add `--with-ai` to pay for one live Meta-generated plan, and/or `--diagnose` to pay for an evidence-checked Meta finding. See [Experiment runner](docs/EXPERIMENTS.md) and [AI diagnosis](docs/DIAGNOSTICS.md). The live Meta API connection was manually validated during development; CI uses mocked Meta responses. Avoid publishing this demo backend without production-grade authentication and quotas.

## Hackathon integrity

Only functionality created during the event will be demonstrated or presented as new. Existing personal-project code is not copied into this repository. Third-party libraries are listed in package manifests; see [HACKATHON_CONTRIBUTIONS.md](HACKATHON_CONTRIBUTIONS.md).

## Submission

- Team: **LoadPilot Labs** (working name)
- Track: **Indie Developer**
- Theme: **Push the Frontier**
- Public repository: this project
- Three-minute demo: _not recorded yet_
- Submission deadline: November 4, 2026, 9:00 PM US Eastern Time (November 5, 3:00 AM Cameroon time)
