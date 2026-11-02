# LoadPilot AI — Final hackathon submission copy

**Submission state:** proposed text is prepared. **A final three-minute video and successful portal submission have not been verified.** Replace placeholders and adjust every measurement claim to the real recorded evidence.

## Entry details

| Form field | Suggested verified value |
| --- | --- |
| Project name | LoadPilot AI |
| Team name | LoadPilot Labs (working name; match your registered identity) |
| Track | Indie Developer |
| Theme | Push the Frontier |
| Event | Meta Global AI Developer Hackathon 2026 |
| Public GitHub | https://github.com/nHallecn/loadpilot-ai |
| Three-minute demo | [PASTE VERIFIED PUBLIC/VIEWABLE VIDEO URL] |
| Public hosted app | [OPTIONAL — DO NOT PROVIDE A LINK TO THE PRIVATE CODESPACE OR AN UNWORKING FRONTEND] |
| Submission deadline | November 4, 2026, 9:00 PM US Eastern = November 5, 03:00 Cameroon time |

The actual submission form may use different labels. Follow the accepted participant's official portal and any later organizer updates.

## One-line description

**AI that investigates why your API is slow — using measured evidence, not guesses.**

## Short pitch (for a concise form field)

LoadPilot AI investigates performance problems using real, bounded HTTP measurements and evidence-grounded Meta Muse Spark explanations. Developers test an API they control, inspect the baseline, change their service, rerun the same configuration and download a before/after evidence report. The model can interpret measurements and propose safe investigations, but cannot launch tests, select targets or override deterministic safeguards.

## Main submission description (paste and adapt to the form)

### Problem

Load testing reveals that an API has become slow, but developers still have to understand the cause, test possible improvements, and know whether a change actually helped. A generic AI explanation may invent metrics or prematurely assert a root cause. A performance investigation should start with **actual measurements**, enforce target ownership and traffic limits, and make uncertainty explicit.

### Solution

**LoadPilot AI** is a TypeScript-based, evidence-first performance investigation workflow with two complementary execution paths.

**1. Test a real local HTTP API (primary demo).** A developer configures exactly one owner-authorized localhost GET endpoint on the private backend. An explicit action runs a bounded HTTP baseline, collecting request counts, p50/p95/p99 latency, observed throughput and errors. The developer reviews the measurements, manually investigates and changes their own service, and explicitly runs a matched follow-up with the same plan. A deterministic comparison shows the observed change. The dashboard exports the two source runs, comparison and limitations as downloadable JSON.

The working demo uses a **separate local Shop API** with an expensive uncached product-ranking workload. Switching it manually to cached mode provides a concrete performance change to measure using real HTTP requests. It remains a purpose-built local example, **not** a production workload or a generalized capacity test.

**2. Investigate with Meta AI (explicit, paid calls).** Meta Muse Spark 1.3 supplies structured test-plan proposals for the bundled demonstration workflow and numerical, evidence-based explanations for completed comparisons. After the two real HTTP runs, the developer can separately request a model interpretation of their observed performance difference. The backend independently validates model citations and numerical assertions. AI hypotheses are not automatically confirmed causes or fixes.

The optional **in-process Fastify.inject sandbox** demonstrates deeper controlled bottleneck contrasts, user-approved model-guided follow-up experiments, three-pair descriptive repeatability assessments, and a SHA-256-checksummed evidence manifest. Those in-process measurements do not include HTTP socket overhead and are distinct from the real HTTP application-testing results.

### Technical execution and Meta integration

- **Stack:** TypeScript, Node.js, Fastify, Next.js/React, Zod, pnpm, Vitest, Meta Model API (Muse Spark 1.3) and GitHub Actions.
- **Meta model tasks:** typed planning, numerical-evidence interpretation, constrained hypothesis selection and follow-up evidence reassessment (in the optional sample workflow).
- **Validation:** strict schemas, deterministic authorization and run limits, matching of completed experiment configurations, independent checking of evidence references and model conclusions.
- **UI:** a guided real-HTTP before → investigate → follow-up flow, real-measurement cards, safe testing controls, a JSON evidence download and clearly labeled limitations.
- **Verification:** CI includes typecheck, tests, production dashboard build and a headless Chromium integration flow. **CI uses fixture AI responses** and is not evidence that a live Meta request succeeded during the judge recording.

### Safety and honesty

Meta's model **cannot execute load tests**, choose destinations, access a shell, deploy fixes or bypass limits. The primary HTTP target is an operator-approved `127.0.0.1` GET path, with no custom bodies or redirects. HTTP tests permit at most **10 request starts/second, 4 parallel workers, 10 seconds and 100 starts per run**, and require explicit user actions. They are not public network tests.

Results are stored in memory and can be lost on restart. The real HTTP JSON export is an **unsigned, unhashed snapshot**. The **separate in-process** repeatability export has a manifest SHA-256 checksum, but it is not a digital signature. A before/after difference is descriptive evidence, **not proof of causality or statistical significance**. The system is a hackathon MVP, not a production, multi-tenant load-testing service.

### Why this is different

LoadPilot combines a guarded, measurable experiment with **AI that is subordinate to evidence and execution policy**. It doesn't simply ask a model to guess why the API is slow. Instead, developers can inspect exactly what was measured, decide what to test next, and review a model explanation that must cite the numbers.

### Development provenance

The LoadPilot AI monorepo, backend, dashboards, Meta integrations, local HTTP runner, experiments, and documentation were developed during the event window and tracked through public GitHub commits and pull requests. A different distributed load-testing project existed earlier, but its code and assets were not copied here. Third-party dependencies are documented in the package manifests. ChatGPT assisted with architecture, code generation, editing and testing workflow; the entrant directs decisions and validates the deliverable. Do not claim human-only implementation or external security certification.

## Demo sequence for judges

1. Introduce the problem, the 3-stage real HTTP workflow, and the **AI cannot execute tests** boundary.
2. Show the fixed local Shop API GET target and bounded parameters.
3. Measure the **uncached** baseline over actual HTTP and inspect p95/throughput/errors.
4. Manually restart the Shop API in **cached** mode without restarting Fastify, then run the identical follow-up.
5. Compare actual measurements and click **Download HTTP evidence JSON**.
6. If a live Meta call is working and recorded, show the evidence-backed Muse interpretation and its limitations.
7. End with the public repo URL and truthfully state local-only/bounded proof limitations.

Detailed timing and screen actions: [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Exact private setup: [LOCAL_APP_TESTING.md](LOCAL_APP_TESTING.md).

## Evidence placeholders to complete after rehearsal

- GitHub commit submitted: **[PASTE EXACT HEAD SHA]**
- Real HTTP baseline p95/throughput/errors: **[INSERT FROM THE RUN]**
- Real HTTP follow-up p95/throughput/errors: **[INSERT FROM THE RUN]**
- Model actually invoked live during demo? **[YES/NO; LINK OR DESCRIBE ONLY GENUINE OUTPUT]**
- JSON evidence file downloaded and inspected? **[YES/NO]**
- Public/viewable demo video URL: **[PASTE AFTER UPLOAD]**
- Official portal confirmation: **[PASTE AFTER SUCCESSFUL SUBMISSION]**

Do not reuse previously recorded synthetic benchmark numbers as if they came from the final HTTP demonstration.

## References and disclosure

- [README](../README.md) — current product and setup
- [Implemented architecture](ARCHITECTURE.md) — components, boundaries, limitations
- [Local app testing](LOCAL_APP_TESTING.md) — actual HTTP execution and limits
- [Meta model integration](META_MODEL_API.md) — server-side model use
- [Browser validation](BROWSER_VALIDATION.md) — fixture versus live AI distinction
- [Event-window contributions](../HACKATHON_CONTRIBUTIONS.md) — code provenance and third-party disclosure
- [Three-minute script](DEMO_SCRIPT.md) — required recording plan
- [Final checklist](FINAL_CHECKLIST.md) — submission gates
