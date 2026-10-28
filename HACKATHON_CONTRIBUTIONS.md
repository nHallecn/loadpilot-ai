# Hackathon Contributions and Provenance

## Event window

Meta Global AI Developer Hackathon, October 26–November 4, 2026.

## Original work

| Component | Status | Evidence |
| --- | --- | --- |
| Repository and documentation | Scaffold completed | Initial October 2026 commits |
| Fastify health API | Scaffold completed | Source and health test |
| Next.js interactive dashboard | Implemented on feat/interactive-dashboard | Client UI, proxy, responsive visuals, local setup docs and CI |
| Meta Model API planner | Implemented on feat/meta-model-api | AI module, strict schema and mocked adapter tests |
| Protected AI plan endpoint | Implemented on feat/meta-model-api | /ai/status and /ai/plan with bearer gate |
| Safe bounded in-process runner | Implemented on feat/load-testing-engine | Rate/concurrency/duration limits, sample cap and cancellation tests |
| Metrics history | In-memory only, max 12 run records | Experiment service + test; durable persistence not implemented |
| AI diagnosis of measured evidence | Implemented on feat/evidence-based-diagnostics (merged) | Strict evidence manifest, JSON schema, independent numeric oracle, protected endpoint and tests |
| Before/after measured comparison | Implemented on feat/load-testing-engine | Experiment comparison endpoint and test |
| Three-minute demonstration | Script and recording checklist prepared; video not recorded | docs/DEMO_SCRIPT.md, docs/FINAL_CHECKLIST.md |
| Descriptive repeated-trial adjudication | Implemented on feat/repeat-trial-evidence | Matching completed pairs, deterministic threshold verdict, transparent limitations and tests |
| Evidence export | Implemented on feat/repeat-trial-evidence | Full source snapshot + SHA-256 checksum; this is not a digital signature or permanent storage |
| Public production deployment | Not started | Requires identity, rate limits, durable jobs and secure hosted backend |
| Hackathon submission text | Prepared, not submitted | docs/SUBMISSION.md and docs/FINAL_CHECKLIST.md |
| Read-only recording preflight | Implemented on docs/hackathon-submission-kit | apps/api/scripts/demo-preflight.mjs (zero AI calls) |

## Pre-existing work

The author has developed a different distributed load-testing platform before the hackathon. **No project source, assets, or pre-existing functionality from that project is reused.** Domain experience informs this original work. The hackathon demo must show only new functionality.

## External tools and dependencies

Fastify, Next.js, React, TypeScript, Vitest, tsx, Zod, Node.js, pnpm and Meta Model API are existing third-party dependencies/services, not original contributions. See package manifests for package versions and applicable upstream licenses.

## Provenance and ethics

- Keep changes attributable through feature branches, PRs, and commit history.
- Never commit API keys, other people's private logs, or unauthorized datasets.
- Identify third-party libraries, templates and assets.
- Differentiate demonstrated capabilities from future roadmap features.
- Meta planner proposals must be validated and independently authorized before any execution.
