# LoadPilot AI

**Autonomous Software Performance Investigator**  
Meta Global AI Developer Hackathon 2026 · Indie Developer · Push the Frontier

> Status: project scaffold. Performance testing, diagnostics, and Meta Model API integration are **not implemented yet**. All project-specific code in this repository is intended to be authored during the October 26–November 4, 2026 hackathon.

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
  api/      Fastify TypeScript API; health endpoint scaffold
  web/      Next.js dashboard scaffold

docs/
  MVP.md           Scope and acceptance criteria
  ARCHITECTURE.md  Planned components and trust boundaries
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
- Run tests: `pnpm test`
- Typecheck: `pnpm typecheck`

Copy `.env.example` to `.env` if you need to configure environment variables. **Never commit your Meta Model API key.** The provider integration is planned, not yet connected.

## Hackathon integrity

Only functionality created during the event will be demonstrated or presented as new. Existing personal-project code is not copied into this repository. Third-party libraries are listed in package manifests; see [HACKATHON_CONTRIBUTIONS.md](HACKATHON_CONTRIBUTIONS.md).

## Submission

- Team: **LoadPilot Labs** (working name)
- Track: **Indie Developer**
- Theme: **Push the Frontier**
- Public repository: this project
- Three-minute demo: _not recorded yet_
- Submission deadline: November 4, 2026, 9:00 PM US Eastern Time (November 5, 3:00 AM Cameroon time)
