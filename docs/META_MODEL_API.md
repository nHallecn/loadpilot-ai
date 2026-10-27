# Meta Model API Integration — Planning and Diagnosis

The planning module implements **test-plan proposals**. The diagnosis module analyzes **numeric evidence from completed local experiments** and proposes follow-up experiments without executing them. A separate bounded, in-process runner performs demo experiments; neither model can trigger arbitrary network load.

## Official API

- Chat Completions: https://api.meta.ai/v1/chat/completions
- Model: muse-spark-1.3 by default
- Authorization: bearer token from MODEL_API_KEY
- Strict JSON schema response with independent Zod validation

References:
- https://dev.meta.ai/docs/cookbook/quickstart-chat-completions
- https://dev.meta.ai/docs/structured-output
- https://dev.meta.ai/docs/error-handling

## Run locally

Use Node 20+ and pnpm 9+. From repository root:

1. pnpm install
2. Copy .env.example into apps/api/.env **or export the variables in your shell**. Note: the scaffold does **not** automatically load .env files; export variables when launching.
3. Export MODEL_API_KEY and choose a random long LOADPILOT_DEMO_TOKEN. Keep both private.
4. pnpm --filter @loadpilot/api dev

Status without secrets:

    curl http://localhost:4000/ai/status

Request a bounded, **non-executable** proposal:

    curl -X POST http://localhost:4000/ai/plan \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer YOUR_PRIVATE_DEMO_TOKEN" \
      -d '{"targetId":"demo-api","objective":"Plan a safe short latency baseline for our sample API."}'

## Safety

- Models do not execute tests; the separate runner accepts only explicit token-protected calls for a bundled in-process target.
- No arbitrary URLs/hosts allowed in request body; the target ID is the literal "demo-api".
- Hard caps: concurrency 1–20, duration 5–30 seconds, rate 1–50 req/s.
- Both static strict JSON Schema and runtime Zod validation restrict model output.
- Meta key stays on API server; no client-side key is generated or checked in.
- Requests require a **separate private demo bearer token**; missing config disables the endpoint.
- Upstream failures return sanitized error codes; no prompt or API key is returned.
- One bounded retry for 429 and 5xx or timeouts; retry waits are capped.
- This is **hackathon demo protection**, not a complete production authentication/rate-limiting system.
- Do not expose the Fastify service publicly without network restrictions and persistent rate limits.
- Store MODEL_API_KEY and LOADPILOT_DEMO_TOKEN in a secret manager for deployment.
- Planning was manually verified with a live model request during the hackathon. CI uses mocked HTTP; live diagnosis still needs local verification.

## Diagnosis milestone

Read [AI diagnosis](DIAGNOSTICS.md) for compatible run criteria, numerical evidence references, validation, and the opt-in paid `--diagnose` demo. Next: build a dashboard and repeat-trial evaluation.
