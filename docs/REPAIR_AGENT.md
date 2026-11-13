# LoadPilot Repair Lab — Action-first Performance Repair v0

**Status:** First executable repair vertical slice. Existing LoadPilot HTTP testing, dashboard, and evidence verification remain unchanged. This lab operates on **one bundled, owner-approved source file**, not arbitrary repositories.

## New capability

LoadPilot no longer stops at explaining why a measured workload might be slow. With an explicit developer opt-in, it asks Meta to **write a replacement implementation** for a real JavaScript function. An independent oracle checks semantic correctness, and a network-disabled, resource-bounded Docker worker measures whether the candidate is faster. If it passes, the CLI exports a reviewable code artifact and patch; it **never mutates the repository source automatically**.

**Input → action → artifact → oracle:**

- Input: the approved `apps/api/examples/repair-lab/catalog.mjs` function (inefficient product ranking) and its SHA-256 source identity
- AI work: Meta Model API generates a full `rankProducts` implementation, not one of a small set of predefined options
- Action: after explicit human approval, execute the replacement in a Docker verification container
- Evidence: independent correctness test across 7 scenarios, matched CPU measurements in 3 dataset sizes, and before/after timings
- Output: evidence JSON, candidate `.repaired.mjs`, and a reviewable `.patch` only if accepted

The CLI enforces no-API-call-by-default and no-test-without-consent:

```bash
# From repository root. Prepare an authorized, private Meta API key in apps/api/.env.
# 1. Explicit source-sharing permission. Proposal is NOT executed.
node --env-file=apps/api/.env apps/api/scripts/repair-agent.mjs \
  --model --send-source-to-meta

# 2. Review apps/api/reports/repair-proposal.json, including the entire source and risk.
# Then separately approve the container execution:
docker pull node:22-alpine
node apps/api/scripts/repair-agent.mjs \
  --verify apps/api/reports/repair-proposal.json --approve-sandbox
```

A successful verification creates `apps/api/reports/repair-evidence.json`, `repair-evidence.repaired.mjs`, and `repair-evidence.patch`. All reports are ignored by Git. Inspect the patch, run additional application-level checks, and decide yourself whether to apply it. Do not apply blindly.

## Reproducible offline verification (does NOT invoke Meta)

The checked-in optimized candidate is a testing control, **not an AI achievement**:

```bash
docker pull node:22-alpine
node apps/api/scripts/repair-agent.mjs \
  --candidate-file apps/api/examples/repair-lab/optimized.example.mjs \
  --approve-sandbox --report-out /tmp/loadpilot-correct.json

# Expected: the independently correct and faster fixture is accepted
node apps/api/scripts/repair-agent.mjs \
  --candidate-file apps/api/examples/repair-lab/incorrect.example.mjs \
  --approve-sandbox --report-out /tmp/loadpilot-incorrect.json --expect-reject
# Expected: invalid result is rejected by hidden correctness cases
```

CI tests both controls in Docker. **CI does not call Meta** and cannot establish real-world model success. A genuine model evaluation needs a separately recorded paid API call and its resulting proposal and sandbox report.

## Trust boundaries

| Boundary | Decision / enforcement |
| --- | --- |
| Source sharing | Only this checked-in authorized file; requires explicit `--send-source-to-meta` |
| Model authority | Proposes replacement source only; no paths, URLs, commands, shell or tool execution decisions |
| Source integrity | Proposal binds to the SHA-256 of the original source; stale proposals are rejected |
| Operator approval | Verification requires a separate `--approve-sandbox` command |
| Verification | Docker user 10001, no network, read-only image/mount, cap-drop all, no-new-privileges, process/memory/CPU/time limits |
| Independent correctness | Oracle implementation is **not included in the Meta request**; 7 case inputs exercise sorting, tie-breaking, casing and edge values |
| Independent benchmark | 3 workloads, 11 paired rounds, alternating baseline/candidate order, medians; pass requires 20% and 0.15 ms improvement in at least 2/3 workloads |
| Artifacts | Evidence report includes source/candidate hashes, image identity, fixture/model provenance, result and caveats; only accepted candidate gets a patch |
| Effect on workspace | No direct edits of the original file, no Git commits, no deployed changes |

The text-based capability scanner is defense-in-depth, **not an isolation primitive**. Docker controls reduce but do not eliminate host/container risk. Do not use this prototype to evaluate unknown hostile code or untrusted user repositories; stronger per-job infrastructure and sandbox hardening are required first. The operator must opt into source disclosure to Meta. Benchmarks are not statistically causal, do not quantify HTTP performance, and cannot prove broad correctness.

## Evaluation and honest claims

- The offline fixtures prove that the harness can **accept a correct faster patch** and **reject an incorrect one**. They do not prove that Meta can consistently create patches.
- Before claiming a success rate, run the live model across several unseen and varied bottlenecks, retain failures, and compare against a no-AI baseline.
- Before extending beyond the single fixture, implement explicit repository ownership, per-repository allowlisted paths, isolated worktrees, stronger container orchestration, prescribed test commands (never model-chosen), dependency-lock checks, and a manual approval gate for PR creation.

## Next milestones, not yet implemented

1. **Repository worker**: authorize and snapshot a developer's local repository, inspect relevant source and profiles, enforce path/size limits, and run in per-job isolated worktrees.
2. **Multi-file bounded patch format**: agent-generated edits with strict file allowlists, staged review, exact hash preconditions, and no secret files.
3. **Automated fair adjudication**: approved unit/integration suites plus repeated representative HTTP workloads; retain only correctness-preserving improvements.
4. **Product interface**: a repair session with proposed diff, verification status, measurements and an explicit approval control.
5. **PR workflow**: export approved patches as reviewable pull requests rather than silently changing working code.

## Unchanged LoadPilot capabilities

The existing locally authorized HTTP runner, safety limits, dashboard, evidence verifier and benchmark tools remain available. **This repair lab does not integrate automatically with the HTTP dashboard yet.** The demo is CLI-first specifically to prioritize a working, independently testable AI-driven action over additional frontend styling.
