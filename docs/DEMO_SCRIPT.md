# LoadPilot AI — 3-minute hackathon demo

**Target runtime:** 02:50–03:00 (never exceed the three-minute limit specified in the participant instructions).

**Format:** desktop screen capture with optional narration and simple captions. Record **the actual interactive dashboard and real data**. Do not substitute mock responses, precomputed charts, or an animation for product execution. A short edit that removes genuine waiting time is acceptable if you visibly label the cut (for example, `Wait time shortened · actual output shown`).

**Before recording:** run `node --env-file=.env scripts/demo-preflight.mjs` from `apps/api`. It performs only local read-only checks, no paid Meta call and no load test. Start Fastify on port 4000 and Next.js on port 3000. Confirm the app works once manually before capturing, and do not expose any credential in the recording.

## Storyboard and narration

| Time | What viewers see | Spoken narration (edit to match the actual screen) |
| --- | --- | --- |
| **00:00–00:16** | Clean dashboard hero. Title overlay: *LoadPilot AI — From metrics to evidence*. | “Performance dashboards tell developers that something is slow. LoadPilot AI helps investigate why, with AI suggestions grounded in actual measurements instead of guesses.” |
| **00:16–00:39** | Safe sample target, question input; click **Generate plan with Muse Spark**. Show received plan parameters and hard limits. | “I describe a performance question. Meta Muse Spark converts it into a structured test proposal. The application independently validates concurrency, request rate and duration. The model cannot choose an arbitrary website or launch an unapproved test.” |
| **00:39–01:17** | Click **Run both experiments** on the private sample API. Show real slow and optimized runs completing, results panels, p95 chart and throughput. If edited, label the time cut clearly. | “With one click, LoadPilot runs two bounded experiments against its bundled sample service. These numbers are measured, not AI-generated. Here are the observed p95 latencies and throughputs from both versions. The comparison shows the performance gap, but not a proven root cause.” |
| **01:17–02:01** | Click **Investigate with AI**. Show real model response; scroll through confidence, evidence references and proposed retest. | “Next, Muse Spark receives only selected numerical evidence from the completed runs. It produces a testable hypothesis and cites the exact measurements supporting it. A separate verification step checks those references and rejects incompatible claims. Notice the confidence label and the warning: this is a hypothesis, not proof.” |
| **02:01–02:34** | **Run confirmation trials**, briefly show actual progress; use a labelled edit to completion if necessary. Show descriptive verdict and **Export evidence JSON**. | “A single experiment could be noise, so I explicitly run two more matched pairs. The application checks whether the improvement repeats under a stated threshold. It exports the source runs and a SHA-256 checksum for review. Three pairs are descriptive evidence, not a statistical proof.” |
| **02:34–02:52** | Return to overview, briefly show code/architecture or display a clean conclusion slide over real application footage. | “LoadPilot separates AI reasoning from execution authority: the model proposes, the runner measures, and an independent validator checks the claims. That is the foundation for safer AI-assisted performance engineering.” |
| **02:52–03:00** | Repo URL and final product title; no fake hosted link. | “LoadPilot AI. Built with Meta Muse Spark during the 2026 Global AI Developer Hackathon.” |

## Screen-recording plan

1. Open the private port 3000 Codespaces preview and unlock the dashboard **before** beginning the capture. Keep the access-key field, .env files, browser password manager, GitHub settings and any payment/billing pages off screen.
2. Set browser zoom near 90–100% so the heading, experiment panel, chart, diagnosis, and repeatability section are readable. Prefer a 1920×1080 capture.
3. Keep the experiment at **5 seconds** per run for the demo. If a model-proposed plan chooses a longer duration, visibly adjust the slider and say that deterministic bounds are enforced. The resulting plan shown must be the actual plan executed.
4. Record the full action chain, even if you later trim pure waiting time. Never paste historical metrics into the live dashboard or claim a different run's results came from the current one.
5. **Repeat-trial warning:** three pairs require **six** experiment runs (two base runs, four confirmation runs), potentially exceeding the video window if the model chooses a longer plan. Record the actual full sequence; speed up/trim passive waiting with an on-screen note, or show an earlier, clearly labeled run's authentic exported report.
6. When showing the diagnosis, zoom in on the real `finding`, `confidence`, and `citedEvidence` UI. Do not narrate a specific number until it has been measured.
7. End on the public code link, not an unconfigured Vercel site. Keep the video within the required duration.

## On-screen text / overlays

Use minimal overlays instead of extra slides:

- `Meta Muse Spark 1.3 · strict plan proposal`
- `Measured p95 / throughput · in-process demo`
- `AI hypothesis · references checked against evidence`
- `Three paired trials · descriptive assessment`
- `No arbitrary targets. No autonomous load generation.`
- `Caveat: not a production benchmark or causal proof`

If shortening footage, add `Elapsed waiting time trimmed; measured output unchanged` and preserve the true order of operations.

## Dry-run checklist

- [ ] Repository branch is merged and Codespace has pulled `main`.
- [ ] Backend responds on `http://127.0.0.1:4000/health`.
- [ ] Frontend responds on private forwarded port 3000.
- [ ] Private dashboard token works; never display its value.
- [ ] Meta Model API is configured and has sufficient credits for optional paid calls.
- [ ] Default/manual plan and real model-proposed plan can be used safely.
- [ ] At least two completed runs appear in the comparison panel.
- [ ] AI diagnosis cites measured values and shows caveats.
- [ ] Three-pair report and local JSON export work.
- [ ] No credentials, personal data, unapproved targets, fake stats or unrelated pre-existing code appear.
- [ ] Rendered video is under the allowed duration and plays outside the recording account.
- [ ] Final GitHub commit/repo link, video URL and disclosures match the submission.

## Fallback if model is rate-limited

Do **not** fake a successful model result. Show the previously captured **real** Muse Spark request and result only if it was recorded from this application; label it as an earlier successful run. Alternately keep the demo focused on the deterministic runner and repeatability and explain that model calls are currently rate-limited. Report the limitation in the submission rather than inventing a response.

## Recording tooling

OBS Studio, the operating system's screen recorder, or a straightforward screen-capture tool is sufficient. Use your own voice or legible captions. Background music is optional and should be licensed or omitted.

## Optional higher-impact Priority 2 recording variant

If the working dashboard now supports it and the live test succeeds: show **Use low-load baseline → Isolate bottleneck factors → Ask Muse to choose a hypothesis → Approve & run two local tests → Ask Muse to reassess**. This more directly demonstrates Meta model reasoning over competing hypotheses. Make the second paid call explicit in the narration. You can trim only real waiting time, labelled honestly; do not claim a particular verdict unless it was actually observed. The full sequence may take more than three minutes if shown in real time; plan edited cuts carefully. See [AI hypotheses](AI_HYPOTHESES.md).
