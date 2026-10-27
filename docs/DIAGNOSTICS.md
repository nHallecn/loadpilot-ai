# Milestone 3: Evidence-backed AI Diagnosis

## What it does

1. First run `slow` and `optimized` experiments with identical parameters against the bundled in-process demo API.
2. `POST /ai/diagnose` with both run IDs (requires private demo bearer token).
3. The server rejects unknown, cancelled, mismatched, or undersampled pairs **before spending Meta credits**.
4. A deterministic evidence manifest is compiled from stored numeric metrics only.
5. Muse Spark proposes a typed explanation, evidence references and one bounded follow-up experiment.
6. The server independently verifies all evidence IDs exist, p95 latency is cited for both runs, and the finding category/confidence is compatible with numeric evidence.
7. The API returns a model hypothesis alongside precise numeric evidence and explicit limitations. **The next experiment is never executed automatically.**

## Request

    POST /ai/diagnose
    Authorization: Bearer <LOADPILOT_DEMO_TOKEN>
    Content-Type: application/json

    {
      "beforeRunId": "a-valid-slow-run-uuid",
      "afterRunId": "a-valid-optimized-run-uuid"
    }

Response contains `status: evidence_backed_hypothesis`, `model`, `finding`, `citedEvidence` (ID/value/unit from the original runs), `nextExperiment: { ..., status: proposal_only }`, `caveats`, and `cached`.

Errors: 400 malformed input; 401 missing/wrong token; 404 unknown run IDs; 422 incompatible or insufficient runs; 429 a concurrent/cooldown attempt; 502 invalid model output/upstream error; 503 missing model/token configuration; 504 timeout.

## Codespaces demo

After merging and pulling, from `apps/api` run the API with server-side secrets:

    node --env-file=.env --import tsx src/server.ts

In a second terminal, to demonstrate the full flow with a local fixed test plan and **one paid diagnosis call**:

    node --env-file=.env scripts/demo-experiments.mjs --diagnose

Add `--with-ai` to get a **second paid call** for planning before the diagnosis.

Do not paste or commit your Meta API key or demo bearer token. `--diagnose` uses your paid Meta credits. Without the flag the run remains deterministic and does not call Meta.

## Trust and validity

- Only `demo-api` synthetic benchmark records are supported. No user host/URL, source code, HTTP headers, prompt, raw sample array, logs or credentials are sent to Meta.
- The evidence manifest contains numeric counts, p95 latency, error rates, observed throughput and computed deltas, plus two run UUIDs.
- Runs must be complete, ordered slow → optimized, have matching rate/concurrency/duration/scenario/metric-focus, and contain at least five samples each.
- Evidence IDs are constrained to 11 allowlisted metrics, must be unique, and must cite both measured p95 latencies.
- A claimed possible serialization bottleneck requires at least ten samples per run and a reduction of at least 10ms and 20%; confidence is at most medium. **Even then it remains a hypothesis.**
- At most one live AI diagnosis runs at a time; a ten-second per-process cooldown applies to uncached pairs. Results are cached in memory for repeated requests to limit credit usage.
- Both demo variants change two variables: serialization and simulated work duration. The comparison **does not prove causality or predict performance in production**.
- Strict schema validation and a deterministic oracle reject unsupported model outputs; the free-text explanation remains model-authored and should be assessed against cited numeric evidence.
- No model-proposed next experiment can automatically run. Callers must explicitly trigger bounded executions separately.
- Results are held in-memory and lost after server restart. Public production hosting remains unsupported without quotas, authentication, privacy controls and durable provenance.

## Evaluation

`pnpm test` includes mocked transport tests, endpoint authentication tests, evidence/oracle checks, caching and route-contract tests. Tests make no paid model calls.

## What remains

Build a user-friendly dashboard showing measured comparisons and AI findings; integrate durable manifests; add repeat-trial adjudication to distinguish noise from reliable patterns. Add real-model acceptance testing under the hackathon account before recording the final demo.
