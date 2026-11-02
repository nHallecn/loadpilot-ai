# Hackathon Contributions and Provenance

## Event window

Meta Global AI Developer Hackathon, October 26–November 4, 2026.

## Original work

| Component | Status | Evidence |
| --- | --- | --- |
| Repository and documentation | Scaffold completed | Initial October 2026 commits |
| Fastify health API | Scaffold completed | Source and health test |
| Next.js interactive dashboard | Implemented and merged (PR #4) | Client UI, proxy, responsive visuals, local setup docs and CI |
| Meta Model API planner | Implemented and merged (PR #1) | AI module, strict schema and mocked adapter tests |
| Protected AI plan endpoint | Implemented and merged (PR #1) | /ai/status and /ai/plan with bearer gate |
| Safe bounded in-process runner | Implemented and merged (PR #2) | Rate/concurrency/duration limits, sample cap and cancellation tests |
| Metrics history | In-memory only, max 12 run records | Experiment service + test; durable persistence not implemented |
| AI diagnosis of measured evidence | Implemented and merged (PR #3) | Strict evidence manifest, JSON schema, independent numeric oracle, protected endpoint and tests |
| Before/after measured comparison | Implemented and merged (PR #2) | Experiment comparison endpoint and test |
| Controlled bottleneck isolation | Implemented and merged (PR #7) | New `parallel_slow` variant, two single-factor contrasts, typed evidence report, dashboard and tests |
| Meta-guided hypothesis and user-authorized retest | Implemented and merged (PR #8) | Two-stage model integration, numeric verification, allowlisted test plan, dashboard and tests |
| Real loopback HTTP app-testing MVP | Implemented and merged (PR #12) | Owner opt-in, fixed GET-only target, request caps, before/after metrics, numeric evidence-checked Meta analysis |
| Three-minute demonstration | Script prepared; no recorded video verified | docs/DEMO_SCRIPT.md, docs/FINAL_CHECKLIST.md |
| Descriptive repeated-trial adjudication | Implemented and merged (PR #5) | Matching completed pairs, deterministic threshold verdict, transparent limitations and tests |
| Evidence export | Implemented and merged (PR #5) | Full source snapshot + SHA-256 checksum; this is not a digital signature or permanent storage |
| Public production deployment | Not started | Requires identity, rate limits, durable jobs and secure hosted backend |
| Hackathon submission text | Prepared, not submitted | docs/SUBMISSION.md and docs/FINAL_CHECKLIST.md |
| Read-only recording preflight | Implemented and merged (PR #6) | apps/api/scripts/demo-preflight.mjs (zero AI calls) |

## Submission state as of November 2, 2026

The source code is available on the public `main` branch. Final real-HTTP demo footage, public video URL and official submission confirmation have **not yet been verified**. A passing CI run uses mock Meta responses; judges must not confuse that with a live Meta inference.

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
