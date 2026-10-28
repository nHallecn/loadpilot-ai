# LoadPilot AI

**Autonomous Software Performance Investigator**  
Meta Global AI Developer Hackathon 2026 · Indie Developer · Push the Frontier

> Status: **End-to-end demo implemented**: Muse Spark planning, bounded in-process experiments, measured comparison, evidence-verified AI diagnosis, an interactive Next.js dashboard, descriptive repeat-trial adjudication with checksum evidence exports, **one-factor controlled bottleneck contrasts**, and a model-guided, explicitly authorized follow-up investigation (on a feature branch pending review). History is in-memory only. Public production deployment is not supported. All project code was authored during the October 26–November 4, 2026 hackathon.

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
  web/      Next.js interactive dashboard and private API gateway

docs/
  MVP.md           Scope and acceptance criteria
  ARCHITECTURE.md  Planned components and trust boundaries
  META_MODEL_API.md Server-side Meta planner setup and security constraints
  EXPERIMENTS.md    Local benchmark and comparison walkthrough
  DIAGNOSTICS.md    Evidence-citing Meta AI diagnosis and independent verification
  DASHBOARD.md      Codespaces setup, app workflow and security boundaries
  REPEATABILITY.md Repeat trials, transparent thresholds and evidence export
  CONTROLLED_INVESTIGATION.md  Isolation of serialization vs processing delay
  AI_HYPOTHESES.md            Muse-guided follow-ups and evidence verification
  SUBMISSION.md    Hackathon project description and disclosure copy
  DEMO_SCRIPT.md   Three-minute recording storyboard and narration
  FINAL_CHECKLIST.md Local preflight, evidence and portal steps
HACKATHON_CONTRIBUTIONS.md  Evidence log and third-party disclosure
```

## Local development

Prerequisites: Node.js 20+ and pnpm 9+.

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:3000 (requires a separate dashboard access key; [setup](docs/DASHBOARD.md))
- API health: http://localhost:4000/health
- API readiness: http://localhost:4000/ai/status
- AI plan proposal: POST http://localhost:4000/ai/plan (private bearer token required)
- Run local experiment: POST http://localhost:4000/experiments/run (private bearer token required)
- Retrieve history: GET http://localhost:4000/experiments
- Compare two runs: POST http://localhost:4000/experiments/compare
- Adjudicate completed pairs: POST http://localhost:4000/experiments/adjudicate (2–3 distinct pairs)
- Evaluate controlled factors: POST http://localhost:4000/investigations/controlled (3 completed matched variants)
- Propose a Muse-guided follow-up: POST http://localhost:4000/ai/hypotheses (paid model call, no execution)
- Reassess a user-run follow-up: POST http://localhost:4000/ai/reassess (paid model call, independent evidence check)
- Diagnose compatible runs: POST http://localhost:4000/ai/diagnose (private bearer token required)
- Run tests: `pnpm test`
- Typecheck: `pnpm typecheck`
- Read-only recording preflight: `cd apps/api && node --env-file=.env scripts/demo-preflight.mjs` (no Meta calls or experiments)

For local setup, configure `apps/api/.env` and run the Fastify server using `node --env-file=.env --import tsx src/server.ts` from `apps/api`. Configure `apps/web/.env.local` with **server-only** `LOADPILOT_BACKEND_TOKEN` (the API demo token) and a **different** `DASHBOARD_ACCESS_TOKEN` (minimum 24 characters), then run `pnpm dev` from `apps/web`. The web dashboard only uses a same-origin Next.js gateway and keeps secrets server-side. Follow the full [dashboard setup guide](docs/DASHBOARD.md). Never commit secrets or expose the demo backend publicly.

The model issues **proposals only**; a separate deterministic runner executes only the bundled in-process demo API, and never loads user-supplied URLs. Run `node --env-file=.env scripts/demo-experiments.mjs` from `apps/api` to compare slow and optimized variants; add `--with-ai` to pay for one live Meta-generated plan, `--diagnose` to pay for an evidence-checked Meta finding, and/or `--repeat` to repeat the bounded demo twice and export a JSON evidence report without additional AI calls. Use `node --env-file=.env scripts/controlled-investigation.mjs` to run the two one-factor contrasts **without model credits**, or `node --env-file=.env scripts/ai-hypothesis-demo.mjs` to request a paid AI hypothesis, review its plan and explicitly authorize a bounded follow-up before a second paid AI reassessment. See [Controlled investigation](docs/CONTROLLED_INVESTIGATION.md), [Experiment runner](docs/EXPERIMENTS.md) and [AI diagnosis](docs/DIAGNOSTICS.md). The live Meta API connection was manually validated during development; CI uses mocked Meta responses. Avoid publishing this demo backend without production-grade authentication and quotas.

## Hackathon integrity

Only functionality created during the event will be demonstrated or presented as new. Existing personal-project code is not copied into this repository. Third-party libraries are listed in package manifests; see [HACKATHON_CONTRIBUTIONS.md](HACKATHON_CONTRIBUTIONS.md).

## Submission

The [submission copy](docs/SUBMISSION.md), [three-minute demonstration script](docs/DEMO_SCRIPT.md), and [final checklist](docs/FINAL_CHECKLIST.md) are prepared. **The video has not been recorded or uploaded and the official submission has not been made.** Confirm actual portal fields, judge access and deadlines before claiming submission.

- Team: **LoadPilot Labs** (working name)
- Track: **Indie Developer**
- Theme: **Push the Frontier**
- Public repository: this project
- Three-minute demo: _not recorded yet_
- Submission deadline: November 4, 2026, 9:00 PM US Eastern Time (November 5, 3:00 AM Cameroon time)
