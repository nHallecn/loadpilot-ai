# LoadPilot AI — Three-minute hackathon demo (real HTTP first)

**Target:** 2:50–3:00, within the official three-minute cap. Screen-record the working app with *actual results*, not mocked charts or CI fixture outputs. Short cuts may remove real waiting only if plainly labelled.

## Setup before recording

1. Follow [LOCAL_APP_TESTING.md](LOCAL_APP_TESTING.md): start `node apps/api/scripts/sample-owned-app.mjs` in **uncached** mode, on the separate `127.0.0.1:4100` shop application.
2. Privately configure `LOADPILOT_APP_TEST_URL=http://127.0.0.1:4100/api/products`, `LOADPILOT_APP_TEST_NAME=Local Shop API`, `LOADPILOT_APP_TEST_CONSENT=I_OWN_THIS_LOCAL_API` in `apps/api/.env`; run Fastify and Next.js with private ports.
3. Unlock the dashboard before capturing, conceal tokens and env files, confirm real local HTTP status and a successful baseline/follow-up rehearsal.
4. Prepare to switch shop mode manually: stop the shop app, restart with `SHOP_QUERY_MODE=cached node apps/api/scripts/sample-owned-app.mjs`. Do **not** restart Fastify between runs; its history is ephemeral.
5. An optional live Muse interpretation requires credits and is requested *after* the follow-up. If credits are unavailable, do not portray test fixtures as a live model response.

## Storyboard

| Time | On screen | Key narration |
| --- | --- | --- |
| 00:00–00:20 | Landing headline, three-step real HTTP preview, execution safety panel | “AI helps investigate a slow API using actual measurements, not guesses; it cannot execute tests.” |
| 00:20–00:45 | Test Your API panel: fixed GET path, consent, rate, workers, duration | “This is a separate service I control. No arbitrary Internet target can be selected.” |
| 00:45–01:12 | Click **Test my API**, show real completed baseline | “Here is the real HTTP p95, observed throughput and errors.” |
| 01:12–01:38 | Investigation checkpoint and manually switching the Shop API from uncached to cached | “I inspect the baseline and make a deliberate application change; AI never deploys a fix.” |
| 01:38–02:10 | Click **Run matched follow-up**, show measured before/after and deterministic delta | “Same test parameters, different observed results. This is a descriptive contrast, not causal proof.” |
| 02:10–02:40 | Click **Download HTTP evidence JSON**; optionally show real, clearly labelled Muse interpretation already obtained | “Judges can inspect both source runs. If invoked, Muse cites the measured numbers and the app checks its claims.” |
| 02:40–02:55 | Limitations section, public GitHub repo and final title | “This is local-only, bounded testing, with evidence-grounded AI hypotheses.” |

If a live AI call needs longer than the recording window, show a **previously recorded genuine** result with clear labelling or leave it out and disclose the limitation. Keep the demonstration's actual event order. Never type fabricated numbers or reveal credentials.

## Truthful claims

- The primary target is a separate **authorized loopback HTTP GET** application, not the synthetic Fastify.inject sample.
- Model-generated plans and hypotheses **cannot launch traffic, choose URLs or run shell commands**.
- HTTP export is a JSON snapshot, **not** signed or cryptographically verified. The optional repeated-trial in-process export separately contains a SHA-256 manifest checksum; that checksum is not a digital signature.
- A single before/after run is not statistical evidence or a proven root cause. The sample shop is controlled, not production-like.
- Optional deeper synthetic investigations, checksum-bearing reports and controlled one-factor contrasts remain valuable secondary features, but the first 30 seconds should explain the real HTTP value.

## Recording checklist

- [ ] Correct fixed local app target status; both apps running; settings within hard limits.
- [ ] Baseline from uncached shop, manual mode change, matching follow-up from cached shop.
- [ ] Real HTTP download includes schema version, source runs, comparison and limitations; no tokens.
- [ ] Any AI model output is genuinely from the live Meta Model API, not CI mock data.
- [ ] Safety and limitations are legible; no secrets appear; video is at most three minutes.
- [ ] Verify the final public repo and video links in a logged-out window.
