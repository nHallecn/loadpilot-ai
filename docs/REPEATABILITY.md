# Repeatable Experiments and Evidence Exports (Milestone 5)

## Purpose

One slow-versus-optimized comparison can be affected by noise. This milestone asks the developer to explicitly repeat the **same bounded test configuration** across three distinct slow/optimized pairs, then evaluates whether an observed p95 reduction meets a transparent descriptive threshold in every pair. It **does not** compute a p-value, assert significance, or establish causality.

## Controls and safety

- The first completed pair comes from the existing dashboard Run Both Experiments action.
- Click **Run confirmation trials** to collect two additional slow/optimized pairs **sequentially**, with the identical plan. This is a **new explicit action**, not autonomous load execution.
- Each of the four additional experiments is independently constrained by the existing 500-request / 1–20 workers / 1–50 req/s / 5–30s runner limits.
- The UI calls a new read-only `POST /experiments/adjudicate` endpoint only after three pairs have completed; the adjudication endpoint does not run workloads or call an AI model.
- An incomplete/cancelled trial cannot be adjudicated. The user can retry the confirmation workflow while the backend retains the completed pairs.
- All runs are against bundled in-process `demo-api`, not real websites. A full workflow may take over two minutes when a 30-second per-run plan is chosen.
- The backend retains the last **12 runs in memory**, and process restarts clear them. Export the report before restarting. Old pairs will be rejected if they have been evicted.

## Deterministic adjudication

`POST /experiments/adjudicate` accepts a JSON body of two or three pairs of UUIDs:

    {
      "pairs": [
        { "beforeRunId": "<UUID slow>", "afterRunId": "<UUID optimized>" },
        { "beforeRunId": "<UUID slow>", "afterRunId": "<UUID optimized>" },
        { "beforeRunId": "<UUID slow>", "afterRunId": "<UUID optimized>" }
      ]
    }

Requires the private Fastify demo bearer token.

Admission gates:

- Distinct completed slow/optimized source runs for the fixed `demo-api` and in-process execution mode.
- Exactly the same scenario, concurrency, planned duration, requests-per-second, and metric focus across the trials; hypothesis text is not a numeric configuration parameter.
- At least 10 completed requests per run and intact sample counts.
- Nonnegative, finite latency, throughput and error-rate measurements, and slow-run timestamp not later than optimized-run timestamp.

A pair meets the **declared demo threshold** only if its measured p95 reduction is at least **10 ms AND 20%**, and the optimized variant's error rate does not increase.

With **three** pairs: all three meeting threshold means `consistent_demo_gap`; some means `mixed_observations`; none means `no_pairs_meet_threshold`. With **two**, verdict remains `insufficient_repeats`. These are descriptive categories only. The median/min/max of pairwise p95 reduction percentages are reported; **they are not confidence intervals**.

## Export and integrity

The response includes the deterministic summary, all underlying source-run measurements (including latency sample arrays, execution parameters and UTC timestamps), and a SHA-256 hex checksum for `JSON.stringify(report.manifest)`.

The JSON exported by the dashboard is a snapshot so it remains reviewable if ephemeral API history expires. It does **not** contain the Meta key or demo access tokens. The checksum identifies a byte-serialized manifest, **not** a signature; it does not prove who generated the data or prevent a malicious person from editing the manifest and recomputing the checksum.

To verify a downloaded JSON locally, run the following in a terminal (replace path with your file path):

    node -e "const fs=require('node:fs'); const crypto=require('node:crypto'); const x=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(crypto.createHash('sha256').update(JSON.stringify(x.manifest)).digest('hex')===x.integrity.digest ? 'checksum matches' : 'CHECKSUM MISMATCH')" /path/to/loadpilot-evidence.json

## CLI fallback

With the Fastify service running, from `apps/api`:

    node --env-file=.env scripts/demo-experiments.mjs --repeat

Runs six local bounded experiments, writes a JSON report under the ignored `apps/api/reports/` directory, and prints the checksum. No Meta API calls are made without `--with-ai` or `--diagnose`.

## Interpretation limits

- This is **not inferential statistics**; with only three pairs there is no hypothesis test or statistical power guarantee.
- The slow variant serializes an approximately 80 ms simulated query; the optimized variant uses independent approximately 8 ms simulated work. **Two factors differ**, so the cause of the observed performance gap cannot be isolated.
- Trials always run slow before optimized. Order drift, thermal effects and background load remain uncontrolled.
- Request counts may differ between runs when queueing causes backpressure; this is recorded rather than disguised.
- In-process Fastify.inject excludes network and socket overhead. No production performance claims are justified.

## Next

Capture a three-minute walkthrough with one paid Muse Spark plan/diagnosis, an actual measured comparison, and the integrity-checkable repeated-trial report. Additional work for real-world measurements would require an authorized network runner, proper control conditions, durable storage, user identity and security reviews.
