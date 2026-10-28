# Final submission checklist — Meta Global AI Developer Hackathon 2026

**Owner:** Approved Indie Developer participant.

**Deadline:** Wednesday, November 4, 2026 at **9:00 PM ET (US Eastern)**, equivalent to **Thursday, November 5 at 03:00 in Cameroon**. Source: https://dev.meta.ai/events/global-hackathon. Check the latest instructions in your participant portal in case the organizer changes submission requirements.

## A. Confirm the build being submitted

- [ ] Review and manually merge PRs for every feature you intend to demonstrate. Do not submit unmerged branch-only features as if they are on `main`.
- [ ] Pull the current `main` in Codespaces: `git pull --ff-only origin main`.
- [ ] Record the exact commit SHA for your submission: `git rev-parse HEAD`.
- [ ] Run `pnpm install`, `pnpm test`, `pnpm typecheck`, and `pnpm --filter @loadpilot/web build` from the repository root.
- [ ] Verify GitHub Actions **unit tests, typechecks, production build and browser-e2e** pass on the submitted commit. Browser AI output is fixture-only and does not replace live Muse verification.
- [ ] Verify public repository access in a private/incognito window: https://github.com/nHallecn/loadpilot-ai

## B. Local services, secrets and privacy

- [ ] Keep `apps/api/.env` private: `MODEL_API_KEY`, `META_MODEL`, `LOADPILOT_DEMO_TOKEN`.
- [ ] Keep `apps/web/.env.local` private: `LOADPILOT_API_BASE_URL`, `LOADPILOT_BACKEND_TOKEN`, `DASHBOARD_ACCESS_TOKEN`.
- [ ] Ensure `LOADPILOT_BACKEND_TOKEN` matches the private backend demo token, while the dashboard token is different and random.
- [ ] Start the API: from `apps/api`, run `node --env-file=.env --import tsx src/server.ts`.
- [ ] Start Next.js: from `apps/web`, run `pnpm dev`.
- [ ] Confirm Codespaces port 3000 is private; keep API port 4000 private. Do not deploy this demo backend publicly.
- [ ] Run the **read-only** preflight script from `apps/api`: `node --env-file=.env scripts/demo-preflight.mjs`. Fix any failed required checks.
- [ ] Close terminals or tabs that could reveal API keys, browser autofill, payment data, environment files, or private tokens while recording.

## C. Record truthful evidence

- [ ] Generate a real Meta Muse Spark test-plan proposal at least once in the project (optional for each rehearsal; each live request consumes credits).
- [ ] Run the slow and optimized **bundled** demo targets, preserving real p95, throughput, errors and timestamps.
- [ ] Call the Meta diagnostic endpoint against completed runs; check that it returns evidence citations and caveats.
- [ ] Explicitly execute two confirmation pairs (three pairs total), and export the SHA-256 report.
- [ ] Verify the report checksum as described in [REPEATABILITY.md](REPEATABILITY.md). Do not call the checksum an authenticated signature.
- [ ] Keep caveats visible: in-process target, two changed bottleneck factors, no causal proof, no statistical significance.
- [ ] Save your finished JSON evidence file somewhere private and backed up; it is not checked in as source code.
- [ ] Optional: record a short screenshot of the passing CI run and source documentation as secondary evidence.

## D. Video

- [ ] Use the [3-minute storyboard](DEMO_SCRIPT.md), staying within the required maximum duration.
- [ ] Show the **working application**, not only slides.
- [ ] Keep narration consistent with actual metrics visible on screen; do not invent exact results.
- [ ] Clearly label shortened waiting, earlier captured real runs, or other edits.
- [ ] Name Meta Muse Spark and show what it contributes at runtime (planning and evidence-citing diagnosis).
- [ ] Show at least one user-authorized load test and a measured comparison.
- [ ] Include safety/limitation disclosures. Avoid implying public network testing or production readiness.
- [ ] Show a real repeatability assessment and export if the video duration permits; otherwise explain in the project description with genuine supporting evidence.
- [ ] Render a video **no longer than 3 minutes**; rewatch to check clarity, audio and readable UI.
- [ ] Upload using the platform requested by the participant portal. Confirm the link is viewable and any embedding/privacy settings allow judges to play it.
- [ ] If upload takes time, finish well before the deadline. No file link or video should be invented.

## E. Portal submission

- [ ] Open the **official participant submission portal** linked from your approved hackathon account/instructions. Do not submit to a similarly named unrelated contest.
- [ ] Select the correct **Indie Developer** track and **Push the Frontier** theme.
- [ ] Use the approved identity/team details as required by the portal (working project-team name: LoadPilot Labs).
- [ ] Paste the [submission description](SUBMISSION.md), then replace placeholders with actual validated values and video URL.
- [ ] Link to the correct public GitHub repository and verify it is readable to a logged-out visitor.
- [ ] Disclose AI runtime integration, AI-assisted development, third-party dependencies and the original event-window contribution.
- [ ] State that no pre-existing distributed load-testing project code was reused.
- [ ] Remove any claims that suggest unimplemented features are currently shipped.
- [ ] Submit before **November 4, 2026 at 9:00 PM Eastern Time** and save the actual confirmation number/screenshot for your records.
- [ ] If the portal has different or additional required fields, follow the portal and official rules. This checklist does not replace them.

## Issues to fix before submission (if they arise)

- **Meta rate limit or expired key:** do not fake a result; check account credits/permissions, then retry within your approved budget. The preflight status shows configuration only, not real Meta availability.
- **Fastify connection refused:** start the backend in a separate terminal; keep both services in the same Codespace.
- **Dashboard unauthorized:** ensure the web's backend token matches the Fastify demo token and the separate dashboard access token is correct.
- **Report request returns 404:** in-memory experiment history was reset or evicted; run the experiments again and export immediately.
- **Report returns 422:** ensure completed slow→optimized pairs share exactly the same plan, each run has sufficient request samples and IDs are unique.
- **Inaccurate or missing video:** do not mark submission as complete. Fix recording, upload and privacy settings first.
