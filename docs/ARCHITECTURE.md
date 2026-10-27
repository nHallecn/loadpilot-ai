# Proposed Architecture (Not Yet Implemented)

```text
Developer → Next.js UI → Fastify API
                          │
                          ├─ Meta Model API adapter
                          │    └─ typed plans & evidence-based diagnosis
                          ├─ policy gate → bounded test runner → authorized local target
                          └─ experiment storage → metrics and run manifests
```

## Trust boundaries

- **AI proposes, deterministic code authorizes.** Model suggestions cannot bypass test limits.
- Run only against explicitly authorized and allowlisted sample endpoints.
- Persist experiment configuration, time range, measurements and the model/version used.
- Separate measurements from generated explanations; every diagnosis needs evidence references.
- Never grant AI unrestricted shell or network command execution.
- Model keys remain server-side.

## Implementation phases

1. Scaffold, smoke tests, Meta model connectivity check.
2. Bounded runner and sample target with intentional bottleneck.
3. Evidence collection and reproducible baseline/retest.
4. Meta-assisted typed test planning and diagnosis.
5. UI visualization, tests, documentation and short demo.
