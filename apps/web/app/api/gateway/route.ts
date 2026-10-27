import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const operations = {
  health: { method: 'GET', path: '/health' },
  status: { method: 'GET', path: '/ai/status' },
  plan: { method: 'POST', path: '/ai/plan' },
  run: { method: 'POST', path: '/experiments/run' },
  history: { method: 'GET', path: '/experiments' },
  compare: { method: 'POST', path: '/experiments/compare' },
  adjudicate: { method: 'POST', path: '/experiments/adjudicate' },
  diagnose: { method: 'POST', path: '/ai/diagnose' },
  cancel: { method: 'DELETE', path: '/experiments/active' },
} as const;

function matchesSecret(received: string | null, expected: string): boolean {
  if (!received || expected.length < 24) return false;
  const provided = Buffer.from(received);
  const required = Buffer.from(expected);
  return provided.length === required.length && timingSafeEqual(provided, required);
}

/**
 * The browser only talks to the Next.js BFF. The Meta credential is never
 * used here; the Fastify bearer token stays on the Next.js server.
 *
 * There is no client-controlled URL or proxy path. Local Codespaces only.
 */
export async function POST(request: NextRequest) {
  const uiSecret = process.env.DASHBOARD_ACCESS_TOKEN ?? '';
  const backendSecret = process.env.LOADPILOT_BACKEND_TOKEN ?? '';
  const backendUrl = process.env.LOADPILOT_API_BASE_URL ?? 'http://127.0.0.1:4000';

  if (!uiSecret || !backendSecret || uiSecret.length < 24) {
    return NextResponse.json(
      { error: 'Dashboard backend is not configured' },
      { status: 503 },
    );
  }

  if (!matchesSecret(request.headers.get('x-loadpilot-access'), uiSecret)) {
    return NextResponse.json({ error: 'Invalid dashboard access key' }, { status: 401 });
  }

  // No arbitrary external upstreams, or remote address overrides, in this MVP.
  let origin: URL;
  try {
    origin = new URL(backendUrl);
    if (
      origin.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost'].includes(origin.hostname) ||
      origin.username || origin.password || origin.search || origin.hash ||
      (origin.pathname !== '/' && origin.pathname !== '')
    ) throw new Error('Only local demo target is supported');
  } catch {
    return NextResponse.json({ error: 'Invalid private backend configuration' }, { status: 503 });
  }

  let input: { action?: string; payload?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 4096) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }
    input = JSON.parse(raw) as { action?: string; payload?: unknown };
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Invalid input');
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request JSON' }, { status: 400 });
  }

  if (!input.action || !Object.prototype.hasOwnProperty.call(operations, input.action)) {
    return NextResponse.json({ error: 'Unknown dashboard operation' }, { status: 400 });
  }

  const { method, path } = operations[input.action as keyof typeof operations];
  const body = method === 'POST' ? JSON.stringify(input.payload ?? {}) : undefined;

  try {
    const upstream = await fetch(new URL(path, origin), {
      method,
      headers: {
        Authorization: 'Bearer ' + backendSecret,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(95000),
    });
    const raw = await upstream.text();
    if (raw.length > 100000) {
      return NextResponse.json({ error: 'Unexpected backend response' }, { status: 502 });
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Backend returned invalid JSON' }, { status: 502 });
    }
    return NextResponse.json(data, {
      status: upstream.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Cannot reach the private LoadPilot API. Start the Fastify server on port 4000.' },
      { status: 502 },
    );
  }
}
