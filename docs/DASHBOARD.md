# LoadPilot AI — Interactive Dashboard (Milestone 4)

## What this milestone delivers

A responsive Next.js interface providing:

- Private workspace access-key gate (key kept in browser memory only, not localStorage).
- Manual bounded plan controls and optional Muse Spark generated plans.
- Sequential slow/optimized in-process demo experiments with cancellation.
- Actual p50/p95/p99 latency chart, throughput and error comparisons.
- Evidence-citing AI diagnosis, supporting numeric measurements and non-executing next-step proposal.
- Recent run history from the Fastify process (up to 12, lost on restart).

The target is **only** the bundled `demo-api`; no external URL inputs or Internet load testing.

## Codespaces setup

### Terminal 1 — API backend

From repository root (after merging this feature PR and pulling to your Codespace):

    pnpm install
    cd apps/api
    node --env-file=.env --import tsx src/server.ts

Your existing `apps/api/.env` must contain **private** `MODEL_API_KEY` and `LOADPILOT_DEMO_TOKEN`; never commit either value.

Check: http://127.0.0.1:4000/health

### Configure the web server (one-time)

In a second Codespaces terminal:

    cd /workspaces/loadpilot-ai/apps/web
    cp .env.example .env.local

Edit `apps/web/.env.local` to set:

- `LOADPILOT_API_BASE_URL=http://127.0.0.1:4000` (the API must be running in the **same Codespace**).
- `LOADPILOT_BACKEND_TOKEN` = exact `LOADPILOT_DEMO_TOKEN` from `apps/api/.env` (server-side only).
- `DASHBOARD_ACCESS_TOKEN` = a **different** random secret at least 24 characters long. Generate with:

      node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

The `.env.local` file must remain uncommitted and must **not** use any `NEXT_PUBLIC_` prefix for these secrets.

### Terminal 2 — Web dashboard

From `apps/web`:

    pnpm dev

Open http://localhost:3000 (or the **private** Codespaces 3000 forwarded-port preview). Enter your `DASHBOARD_ACCESS_TOKEN` into the access-key field.

**Do not make port 3000 public.** The current gate is a hackathon demo key, not multi-user authentication.

## Demo steps

1. Connect the private workspace (no Meta credits used).
2. Optionally click **Generate plan with Muse Spark** (one paid planning request). Or keep safe manual defaults.
3. Click **Run both experiments** (slow and optimized). The UI reports progress, and measured runs are stored server-side.
4. Inspect measured p95 and p50/p99 chart and throughput changes. The observed result is **not causal proof**.
5. Click **Investigate with AI** (one paid diagnosis unless cached). The agent cites verified numeric measurements and offers a non-executed follow-up.
6. Review recent runs in the history table. This history resets when Fastify restarts.

## Security and architecture

Browser → same-origin Next.js `POST /api/gateway` (with a private dashboard access key) → **server-side only** Fastify on `127.0.0.1:4000` (private backend bearer token) → bounded in-process demo API / server-side Meta API.

- The web UI never receives `MODEL_API_KEY` or the Fastify bearer token.
- The gateway accepts only eight fixed operations (`health`, `status`, `plan`, `run`, `history`, `compare`, `diagnose`, `cancel`); arbitrary upstream URLs and paths are impossible.
- The upstream hostname is restricted to `localhost` or `127.0.0.1` via an environment variable. No remote backend is supported yet.
- No persistent credentials in browser localStorage or cookies. Access key is cleared on lock/reload.
- Web routes require a strong, separate dashboard access token and use timing-safe comparisons.
- The backend remains the authority enforcing plan schema, authentication, maximum request count, durations and independent diagnosis verification.
- API action UI labels disclose paid model calls. The default plan requires no AI spending.
- Frontend is **not** production-ready: no sessions/roles, persistent rate limits, reverse proxy, backend authentication rotation, CSRF controls beyond a custom header, durable tasks or persistent history.
- Next.js and Fastify must run together on the same Codespace. **Deploying the Next.js frontend alone on Vercel does not connect it to a remote API.**

## Verification

`pnpm test`, `pnpm typecheck`, and `pnpm --filter @loadpilot/web build` are verified by GitHub Actions on the pull request. Manual end-to-end demo steps require your local `.env` secrets and Codespace.

## Next milestone

Improve demo reliability and repeat-trial statistical adjudication, save immutable evidence artifacts, and record the final three-minute submission video.
