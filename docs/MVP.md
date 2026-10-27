# LoadPilot AI: Hackathon MVP

## Goal

Demonstrate a closed-loop, AI-assisted performance investigation against an authorized, intentionally bottlenecked local API.

## Required demo sequence

1. User selects a bundled local test target and writes a performance question.
2. Meta model generates a typed test plan. The application validates and bounds every parameter.
3. A runner executes the approved test under hard resource/time limits.
4. API stores and presents real metrics, logs and experiment metadata.
5. The model proposes one or more hypotheses with evidence and uncertainty.
6. User makes an explicit change to the sample target or uses a provided fixed variant.
7. A retest produces a documented before/after comparison; no unsupported causality claims.

## Safety acceptance criteria

- Milestone 2 accepts no target URLs or hostnames: only a literal demo-api ID which routes to an isolated, in-process Fastify.inject target. Consequently it has no SSRF network surface. Any future network runner must enforce DNS/IP/redirect authorization.
- Limits on concurrency, duration, requests and rate are enforced outside the model.
- Model output is untrusted and schema-validated before any tool invocation.
- Active in-process runs can be cancelled using DELETE /experiments/active (no new requests start; current in-flight handlers finish).
- Do not send credentials or sensitive user logs to a model.

## Demo acceptance criteria

- One reproducible slow-versus-fixed sample target.
- At least two measured runs with labeled configurations and timestamps.
- Deterministic metrics separate from model inference.
- Hypothesis cites run evidence rather than invented observations.
- Demonstration fits a three-minute video.
