# Priority 2 — AI-Guided Hypotheses and Evidence Retests

## Demonstration goal

Turn an AI explanation of an already-known latency gap into **a testable competing hypothesis followed by an explicitly approved, bounded new experiment and evidence-based reassessment**.

Meta Muse Spark proposes and explains; deterministic TypeScript logic fixes allowed experiments and verifies numeric conclusions. **The model cannot execute load tests.**

## 1. Three measured initial variants (Priority 1)

- `slow`: serialized, 80 ms simulated work
- `parallel_slow`: concurrent, 80 ms simulated work
- `optimized`: concurrent, 8 ms simulated work

Measure all three with the same plan, then call `POST /investigations/controlled` to build verified independent contrasts.

## 2. Ask Muse to choose a useful follow-up (paid request)

Call `POST /ai/hypotheses` using the **same three run IDs** used in the controlled report. The server rejects missing/mismatched/undersampled runs without contacting the model.

Muse receives a **numeric-only evidence manifest**: initial p95 latencies, sample counts, error rates, first-run traffic settings and both predeclared contrast signals. No credentials, raw logs, source code, target URLs or arbitrary headers are sent.

The model returns typed JSON: chosen `hypothesis` (`serialization_overhead` or `processing_delay`), the actual `initialSignal`, references to the selected pair's p95 metrics, a short rationale and **one** follow-up action.

Allowed actions are:

- `repeat_serialization`: repeat `slow` versus `parallel_slow` with exactly the original settings.
- `repeat_processing`: repeat `parallel_slow` versus `optimized` with exactly the original settings.
- `probe_serialization_high_load`: **only** if the initial serialization signal was **not observed** and the initial traffic is low (`concurrency <= 2`, `RPS <= 10`). The server constructs fixed, bounded `concurrency=8`, `RPS=30` settings for **both** variants, leaving the 80ms per-request work unchanged.

The model does **not** set concurrency, rate, target, HTTP method, runtime duration or an external URL. Each plan is validated by Zod and runner caps (500 requests maximum). A proposal inconsistent with the measured signal, cited hypothesis, or permitted action fails closed with HTTP 502.

The response contains a temporary `investigationId`, a `proposal_only` executable plan and its **two allowed variants**. Results and sessions are **memory-only**, capped at eight sessions, and expire after thirty minutes. Identical valid requests are cached within this process to reduce model charges.

## 3. User authorization and new measurements

The dashboard requires a separate explicit click **Approve & run these 2 local tests**. The CLI asks the user to type `RUN` after displaying the exact proposed plan; declining leaves the test unexecuted.

Each new run is independently constrained by the private runner: 1–20 workers, 1–50 global request starts/s, 5–30 seconds per run, up to 500 requests, no arbitrary network targets. The dashboard reports both new measured p95 values. Retests must be **new, completed and ordered**, use the exact server-generated configuration and match the expected variant sequence.

## 4. Muse evaluates the new evidence (second paid request)

`POST /ai/reassess` accepts the temporary investigation ID and the **two real follow-up run IDs**. The server validates that the pair is new, ordered, complete, sufficiently sampled and exactly matches the approved plan **before contacting Meta**.

Muse receives only old/new measured p95 latencies, sample counts, signals, and traffic settings. Its structured verdict must match the independent deterministic expected verdict:

- `replicated_signal`: initially observed and observed again under a repeated configuration
- `load_dependent_signal_observed`: initially **not observed** at low load, newly observed under a higher-load serialization probe
- `inconsistent_signal`: signal changes inconsistently between comparable conditions
- `still_inconclusive`: no additional informative signal or an error regression

Note: These labels describe **observations**. Neither one follow-up pair nor a load change establishes statistical significance, a production root cause, or a scientifically confirmed causal mechanism. The model-authored explanation is not mathematically verified word-for-word; the categorical claim and cited numeric evidence IDs **are independently checked**.

The response includes model explanation, checked verdict, exactly cited numeric measurements, original/follow-up signals and the original/new load configuration. Requests for already-reviewed pairs are cached; mismatched retest IDs cannot retrieve a different review.

## The 3-minute demo story

Select the dashboard **Use low-load baseline** preset (1 worker, 5 req/s, five seconds per run) and click **Isolate bottleneck factors**. The serialization contrast will generally show little or no difference at low load. Click **Ask Muse to choose a hypothesis**; Muse can propose a bounded high-load serialization probe. Review its plan, explicitly run the two approved variants and ask Muse to reassess. The outcome may show a **load-dependent** signal where none was observed earlier.

Do not force or fake a desired model response or measurements: if the actual run differs, present the real outcome and the validation limitations. If Muse picks another allowed follow-up, show that valid workflow rather than claiming it picked the high-load probe.

## Interactive CLI (two real paid calls)

Start the Fastify API privately on 127.0.0.1:4000, then from `apps/api`:

    node --env-file=.env scripts/ai-hypothesis-demo.mjs

This runs the three measured initial experiments and makes one paid proposal call. It prints the fixed follow-up plan and **asks for `RUN` authorization** before running two more bounded local experiments and making the second paid AI reassessment call.

## Security and limitations

- The API is protected with the existing private demo bearer token. The web gateway uses its distinct access key.
- Only allowlisted variants of the bundled in-process `demo-api` are eligible.
- A model-generated action cannot trigger arbitrary HTTP traffic, hosts, requests, files or shell commands.
- Strict structured JSON schema, independent Zod validation, explicit exact-pair evidence references, and a numeric verdict oracle reject unsupported outputs.
- The server serializes paid hypothesis/reassessment requests, uses an eight-second per-process cooldown and caches sessions. **These are not durable user quotas** and do not make the demo safe for public Internet deployment.
- Session data and run history are lost on restart; old IDs then fail normally.
- The experiment is **synthetic**, with deterministic configured factors but nonrandomized trial order. It does not generalize to live services or prove production causality.
- Meta API credits are consumed for proposal and reassessment unless the corresponding request was already cached.

## Test acceptance

- A low-load ambiguous serialization result offers a strictly bounded, higher-load two-variant probe.
- A model cannot invent metrics, choose arbitrary variant pairs or bypass strict initial evidence consistency.
- A follow-up is never launched by AI endpoints; user authorization is a separate action.
- A future/duplicate/incompatible run cannot substitute for actual approved follow-up evidence.
- A model-assigned verdict contradicting a deterministic observed result is rejected.
- Duplicate requests do not silently incur additional AI costs.
- GitHub CI passes tests, types and Next.js production build; **live Meta integration and browser testing still require the private Codespace**.

## Next priority

**Priority 3:** Validate the full browser interaction in Codespaces, collect authentic data, tighten any usability issues and capture the three-minute hackathon video and submit via the official portal.
