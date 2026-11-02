'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import {
  compactId, defaultPlan, formatNumber,
  type Comparison, type DashboardAction, type ExperimentRun, type Finding, type TestPlan,
  type TrialPair, type TrialReport, type ControlledReport, type HypothesisSession, type HypothesisReview,
  type LocalAppStatus, type LocalAppRun, type LocalAppComparison, type LocalAppFinding,
} from '../lib/contracts';

type Busy = 'connecting' | 'planning' | 'running-slow' | 'running-optimized' | 'comparing' | 'diagnosing' | 'confirming' | 'isolating' | 'hypothesizing' | 'retesting' | 'reassessing' | null;

async function gateway<T>(
  secret: string,
  action: DashboardAction,
  payload?: unknown,
): Promise<T> {
  const response = await fetch('/api/gateway', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-loadpilot-access': secret,
    },
    body: JSON.stringify({ action, payload }),
    cache: 'no-store',
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data &&
      typeof data.error === 'string' ? data.error : 'Request failed';
    throw new Error(error + ' (HTTP ' + response.status + ')');
  }
  return data as T;
}

function SymbolIcon({ kind }: { kind: string }) {
  const paths: Record<string, ReactNode> = {
    pulse: <><path d="M3 12h4l3-7 4 14 3-7h4"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    spark: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m19 17 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/></>,
    play: <><path d="m8 5 11 7-11 7V5Z"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 3 2 5-7"/></>,
    arrow: <><path d="M5 12h14m-7-7 7 7-7 7"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14-5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14 5l3-3"/><path d="M21 20v-5h-5"/></>,
    cpu: <><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/></>,
  };
  return <svg className="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind] ?? paths.pulse}</svg>;
}

function MetricBox({ label, value, detail, accent }: {
  label: string; value: string; detail: string; accent?: 'mint' | 'pink';
}) {
  return (
    <div className={'metric-box ' + (accent ?? '')}>
      <p className="metric-name">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-detail">{detail}</p>
    </div>
  );
}

function LatencyChart({ before, after }: { before: ExperimentRun; after: ExperimentRun }) {
  const percentileKeys = ['p50', 'p95', 'p99'] as const;
  const max = Math.max(
    1,
    ...percentileKeys.flatMap((key) => [before.metrics.latencyMs[key], after.metrics.latencyMs[key]]),
  );
  return (
    <div className="chart-area" aria-label="Grouped bar chart comparing p50, p95 and p99 latencies of two recorded runs">
      <div className="chart-legend"><span className="legend-mark slow-dot"/> Slow API <span className="legend-mark fast-dot"/> Optimized API</div>
      <div className="chart-rows">
        {percentileKeys.map((key) => {
          const a = before.metrics.latencyMs[key], b = after.metrics.latencyMs[key];
          return (
            <div className="chart-row" key={key}>
              <span className="chart-label">{key.toUpperCase()}</span>
              <div className="chart-bars">
                <div className="bar-line"><div className="bar slow-bar" style={{ width: Math.max(1, a / max * 100) + '%' }}/><span>{formatNumber(a)} ms</span></div>
                <div className="bar-line"><div className="bar fast-bar" style={{ width: Math.max(1, b / max * 100) + '%' }}/><span>{formatNumber(b)} ms</span></div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted-note">Measured in-process handler latencies · lower is better</p>
    </div>
  );
}


/** A schematic of the same private target the experiment runner actually measures.
 * No synthetic charts or invented p95 numbers are rendered while idle.
 */
function SystemJourney({
  plan, before, after, busy,
}: {
  plan: TestPlan;
  before: ExperimentRun | null;
  after: ExperimentRun | null;
  busy: Busy;
}) {
  const running = busy === 'running-slow' || busy === 'running-optimized' ||
    busy === 'isolating' || busy === 'retesting' || busy === 'confirming';
  const observed = Boolean(before && after && before.status === 'completed' && after.status === 'completed');
  return (
    <div className={'journey-visual ' + (running ? 'journey-running' : '')}
      aria-label="Illustration of the included sample testing workflow; customer application testing is configured separately">
      <div className="journey-top">
        <span className="journey-kicker"><span className="journey-indicator"/> SAMPLE TEST FLOW</span>
        <span className="journey-safe"><SymbolIcon kind="shield"/> LOCAL · AUTHORIZED</span>
      </div>
      <div className="journey-canvas">
        <div className="journey-node">
          <div className="journey-symbol journey-traffic"><SymbolIcon kind="pulse"/></div>
          <strong>Traffic</strong>
          <small>{plan.requestsPerSecond} req/s · {plan.concurrency} workers</small>
        </div>
        <div className="journey-link" aria-hidden="true">
          <span className="journey-packet journey-packet-one"/>
          <span className="journey-packet journey-packet-two"/>
          <span className="journey-packet journey-packet-three"/>
        </div>
        <div className="journey-node journey-node-target">
          <div className="journey-symbol journey-server"><SymbolIcon kind="cpu"/></div>
          <strong>Example API</strong>
          <small>demo-api</small>
          <span className="journey-target-caption">SAFE TEST TARGET</span>
        </div>
        <div className="journey-link journey-link-out" aria-hidden="true">
          <span className="journey-packet journey-packet-one"/>
          <span className="journey-packet journey-packet-two"/>
        </div>
        <div className="journey-node">
          <div className="journey-symbol journey-evidence"><SymbolIcon kind="chart"/></div>
          <strong>Evidence</strong>
          <small>p95 · throughput · errors</small>
        </div>
      </div>
      <div className="journey-meter">
        {observed && before && after ? (
          <>
            <div className="journey-meter-head"><span>Measured in this session</span><span>p95 latency · lower is better</span></div>
            <div className="journey-meter-row"><span className="journey-slow-dot"/> Slow <strong>{formatNumber(before.metrics.latencyMs.p95)} ms</strong></div>
            <div className="journey-meter-row"><span className="journey-fast-dot"/> Optimized <strong>{formatNumber(after.metrics.latencyMs.p95)} ms</strong></div>
          </>
        ) : (
          <>
            <div className="journey-meter-head"><span>{running ? 'MEASURING REQUESTS…' : 'HOW THE INVESTIGATION WORKS'}</span><span>NO PRE-FILLED DATA</span></div>
            <p>Send bounded requests, record genuine timings, then ask Meta Muse Spark to interpret the evidence.</p>
          </>
        )}
      </div>
      <div className="journey-footer"><SymbolIcon kind="spark"/> <span>Muse Spark explains evidence. It never controls traffic.</span></div>
    </div>
  );
}


/**
 * A separate, real-HTTP product flow. Backend operator must opt in to a
 * loopback GET endpoint; neither the user nor Meta selects target URLs.
 */
function LocalApplicationPanel({ connected, accessKey, aiConfigured }: {
  connected: boolean; accessKey: string; aiConfigured: boolean;
}) {
  const [target, setTarget] = useState<LocalAppStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [rps, setRps] = useState(3);
  const [workers, setWorkers] = useState(2);
  const [seconds, setSeconds] = useState(5);
  const [first, setFirst] = useState<LocalAppRun | null>(null);
  const [second, setSecond] = useState<LocalAppRun | null>(null);
  const [comparison, setComparison] = useState<LocalAppComparison | null>(null);
  const [finding, setFinding] = useState<LocalAppFinding | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!connected) { setTarget(null); return; }
    let alive = true;
    setLoading(true);
    gateway<LocalAppStatus>(accessKey, 'appStatus').then(status => {
      if (alive) { setTarget(status); setError(''); }
    }).catch(e => {
      if (alive) setError(e instanceof Error ? e.message : 'Could not check local app');
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [connected, accessKey]);

  function changeSettings(key: 'rate' | 'workers' | 'seconds', value: number) {
    if (running || analyzing) return;
    if (key === 'rate') setRps(value);
    if (key === 'workers') setWorkers(value);
    if (key === 'seconds') setSeconds(value);
    setFirst(null); setSecond(null); setComparison(null); setFinding(null);
  }

  async function runLocalApp() {
    if (!connected || !target?.configured || running) return;
    setRunning(true); setError(''); setFinding(null);
    try {
      const result = await gateway<LocalAppRun>(accessKey, 'appRun', {
        targetId: 'my-local-api',
        plan: {
          scenario: 'baseline', concurrency: workers, durationSeconds: seconds,
          requestsPerSecond: rps, metricFocus: 'latency',
          hypothesis: 'Measure this owner-authorized local HTTP API at the same bounded traffic settings.',
        },
      });
      if (result.status !== 'completed') throw new Error('Application test cancelled');
      if (!first) {
        setFirst(result);
      } else {
        const checked = await gateway<LocalAppComparison>(accessKey, 'appCompare', {
          beforeRunId: first.id, afterRunId: result.id,
        });
        setSecond(result);
        setComparison(checked);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'App test failed');
    } finally { setRunning(false); }
  }

  async function analyze() {
    if (!first || !second || !aiConfigured) return;
    setAnalyzing(true); setError('');
    try {
      const result = await gateway<LocalAppFinding>(accessKey, 'appDiagnose', {
        beforeRunId: first.id, afterRunId: second.id,
      });
      setFinding(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI analysis failed');
    } finally { setAnalyzing(false); }
  }


  function exportLocalEvidence() {
    if (!first || !second || !comparison) return;
    const report = {
      schemaVersion: 'loadpilot.local-http-evidence.v1',
      exportedAt: new Date().toISOString(),
      source: 'actual authorized loopback HTTP measurements',
      target: { name: first.targetName, method: 'GET', path: target?.path ?? null },
      baseline: first, followUp: second, comparison,
      modelInterpretation: finding ?? null,
      limitations: [
        'Only operator-allowlisted local GET testing is supported.',
        'A before/after observation does not establish causality or statistical significance.',
        'Model-generated hypotheses are not proof of a root cause.',
        'This JSON snapshot is neither digitally signed nor cryptographically verified.',
      ],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'loadpilot-http-evidence-' + first.id.slice(0, 8) + '-' + second.id.slice(0, 8) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const ready = connected && target?.configured;
  return (
    <section className="panel app-test-panel" id="my-application" aria-label="Test your own local application">
      <div className="app-product-head">
        <div>
          <p className="overline"><SymbolIcon kind="cpu"/> APPLICATION PERFORMANCE TESTING</p>
          <h2>Test your API</h2>
          <p>Connect an API you own or are authorized to test, measure its HTTP performance, and compare the results before and after a change. This first release supports a locally running API configured by the backend owner.</p>
        </div>
        <span className={'app-ready-badge ' + (ready ? 'app-ready-online' : '')}>
          <span className="tiny-success"/>{ready ? 'LOCAL APP READY' : 'OWNER SETUP REQUIRED'}
        </span>
      </div>

      <div className="app-story-steps" aria-label="Before investigation and verified follow-up">
        <div className="app-story-step"><span className={first ? 'story-done' : 'story-current'}>01</span><div><strong>Before</strong><small>{first ? 'Real baseline recorded' : 'Measure your local API'}</small></div></div>
        <div className="app-story-step"><span className={first ? 'story-current' : ''}>02</span><div><strong>Investigate</strong><small>{first ? 'Inspect metrics and change your app' : 'Review the baseline first'}</small></div></div>
        <div className="app-story-step"><span className={comparison ? 'story-done' : first ? 'story-current' : ''}>03</span><div><strong>Verified follow-up</strong><small>{comparison ? 'Matched HTTP runs compared' : 'Rerun the same settings'}</small></div></div>
      </div>
      <div className="app-target">
        <span className="app-target-icon"><SymbolIcon kind="cpu"/></span>
        <div>
          <span className="field-label">AUTHORIZED TARGET</span>
          <strong>{ready ? target.targetName : 'Your application endpoint'}</strong>
          <small>{ready ? 'GET ' + target.path + ' · 127.0.0.1 · server-owned configuration'
            : 'Set LOADPILOT_APP_TEST_URL and owner consent in apps/api/.env, then restart Fastify'}</small>
        </div>
        <span className="app-target-status">{loading ? 'CHECKING' : ready ? 'CONNECTED' : 'NOT CONFIGURED'}</span>
      </div>
      {!ready && (
        <div className="app-setup-tip">
          <SymbolIcon kind="shield"/>
          <div>
            <strong>Connect a real application safely</strong>
            <p>Start your own API on local port 4100, choose a read-only GET route, and configure its fixed loopback address in the private Fastify environment. No arbitrary public URL testing is enabled.</p>
            <a href="https://github.com/nHallecn/loadpilot-ai/blob/main/docs/LOCAL_APP_TESTING.md" target="_blank" rel="noreferrer">Read local application setup</a>
          </div>
        </div>
      )}
      <div className="app-settings">
        <label>Request rate
          <span>{rps} req/s</span>
          <input aria-label="Local API request rate" type="range" min={1} max={10} value={rps}
            onChange={e=>changeSettings('rate',Number(e.target.value))} disabled={running || analyzing}/>
        </label>
        <label>Parallel workers
          <span>{workers}</span>
          <input aria-label="Local API concurrency" type="range" min={1} max={4} value={workers}
            onChange={e=>changeSettings('workers',Number(e.target.value))} disabled={running || analyzing}/>
        </label>
        <label>Duration
          <span>{seconds} sec</span>
          <input aria-label="Local API duration" type="range" min={5} max={10} value={seconds}
            onChange={e=>changeSettings('seconds',Number(e.target.value))} disabled={running || analyzing}/>
        </label>
      </div>

      {first && !second && (
        <div className="app-investigation-note" role="status"><SymbolIcon kind="chart"/><div><strong>Investigation checkpoint — baseline captured</strong><p>Review the p95, throughput and error rate below. Inspect your own service and make one deliberate change. Then run the matched follow-up. Nothing runs automatically.</p></div></div>
      )}
      <div className="app-test-action">
        <div>
          <strong>{!first ? 'Step 1 — Measure baseline' : !second ? 'Step 2 — Measure after your change' : 'Results captured'}</strong>
          <p>{!first
            ? 'Start a bounded test of your own running API.'
            : !second
              ? 'Make a safe change to your application, then run the exact same test again.'
              : 'Both measured HTTP runs used the same test parameters. Changes are descriptive, not a proven cause.'}</p>
        </div>
        {second ? (
          <button type="button" className="button outline-button" onClick={()=>{setFirst(null);setSecond(null);setComparison(null);setFinding(null);}} disabled={running || analyzing}>
            Start new baseline
          </button>
        ) : (
          <button type="button" className="button primary" disabled={!ready || running || analyzing}
            onClick={()=>void runLocalApp()}>
            {running ? <span className="spinner"/> : <SymbolIcon kind="play"/>}
            {running ? 'Measuring your API…' : first ? 'Run matched follow-up' : 'Test my API'}
          </button>
        )}
      </div>
      {running && (
        <div className="app-running">
          <span className="spinner"/> Making bounded HTTP GET requests to your approved local endpoint…
          <button type="button" className="cancel-button" onClick={()=>void gateway(accessKey,'appCancel').catch(()=>undefined)}>Cancel</button>
        </div>
      )}
      {error && <div className="alert" role="alert"><SymbolIcon kind="shield"/> {error}</div>}
      {first && (
        <div className="app-measurement-grid">
          {[first,second].filter((run): run is LocalAppRun => Boolean(run)).map((run,index) => (
            <div className="app-measurement" key={run.id}>
              <span className="field-label">{index===0?'BEFORE · REAL HTTP':'AFTER · REAL HTTP'}</span>
              <strong>{formatNumber(run.metrics.latencyMs.p95)} <small>ms p95</small></strong>
              <div><span>{run.metrics.requestCount} requests</span><span>{formatNumber(run.metrics.observedRps)} req/s</span><span>{formatNumber(run.metrics.errorRatePercent)}% errors</span></div>
            </div>
          ))}
        </div>
      )}
      {comparison && (
        <div className="app-comparison">
          <strong>{comparison.p95DeltaMs > 0 ? 'Latency increased' : comparison.p95DeltaMs < 0 ? 'Latency decreased' : 'No measured p95 change'}</strong>
          <span>{formatNumber(Math.abs(comparison.p95DeltaMs))} ms difference · {comparison.p95ReductionPercent == null ? '—' : formatNumber(comparison.p95ReductionPercent) + '%'} before-to-after reduction</span>
          <p>{comparison.note}</p>

          <div className="app-evidence-actions">
            <button type="button" className="button primary" onClick={exportLocalEvidence}><SymbolIcon kind="chart"/> Download HTTP evidence JSON</button>
            <small>Actual recorded runs and comparison, with limitations. Unsigned snapshot — export before restarting the backend.</small>
          </div>
          <button type="button" className="button ai-button" onClick={()=>void analyze()} disabled={!aiConfigured || analyzing}>
            {analyzing ? <span className="spinner"/> : <SymbolIcon kind="spark"/>}
            {analyzing ? 'Verifying AI evidence…' : 'Ask Muse to explain the measured change (paid)'}
          </button>
        </div>
      )}
      {finding && (
        <div className="app-finding">
          <span className="overline"><SymbolIcon kind="spark"/> META MUSE SPARK · EVIDENCE-CHECKED</span>
          <h3>{finding.finding.finding.replaceAll('_',' ')}</h3>
          <p>{finding.finding.explanation}</p>
          <p><strong>Suggested next step:</strong> {finding.finding.nextStep}</p>
          <div className="app-finding-citations">
            {finding.citedEvidence.map(e=><span key={e.id}>{e.id}: <strong>{formatNumber(e.value)} {e.unit}</strong></span>)}
          </div>
          <p className="muted-note">{finding.limitations.join(' ')}</p>
        </div>
      )}
      <p className="muted-note">Safety: owner opt-in · exact localhost GET endpoint · max 10 req/s, 4 workers, 10 seconds · no redirects or custom request bodies · no external Internet targets.</p>
    </section>
  );
}

export default function HomePage() {
  type JourneyPath = 'local' | 'sample' | 'investigate';
  const [accessKey, setAccessKey] = useState('');
  const [connected, setConnected] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [journeyPath, setJourneyPath] = useState<JourneyPath>('local');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Ready for a local performance investigation.');
  const [objective, setObjective] = useState('Find evidence of latency degradation under controlled load in the bundled demo API.');
  const [plan, setPlan] = useState<TestPlan>({ ...defaultPlan });
  const [planSource, setPlanSource] = useState<'manual' | 'muse'>('manual');
  const [before, setBefore] = useState<ExperimentRun | null>(null);
  const [after, setAfter] = useState<ExperimentRun | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [diagnosis, setDiagnosis] = useState<Finding | null>(null);
  const [history, setHistory] = useState<ExperimentRun[]>([]);
  const [trialPairs, setTrialPairs] = useState<TrialPair[]>([]);
  const [trialReport, setTrialReport] = useState<TrialReport | null>(null);
  const [confirmationProgress, setConfirmationProgress] = useState(0);
  const [controlledReport, setControlledReport] = useState<ControlledReport | null>(null);
  const [isolationStep, setIsolationStep] = useState(0);
  const [hypothesisSession, setHypothesisSession] = useState<HypothesisSession | null>(null);
  const [followUpRuns, setFollowUpRuns] = useState<ExperimentRun[]>([]);
  const [hypothesisReview, setHypothesisReview] = useState<HypothesisReview | null>(null);

  useEffect(() => {
    const sectionIds = ['overview', 'my-application', 'experiments', 'analysis', 'history'];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActiveSection(visible.target.id);
    }, { rootMargin: '-16% 0px -66% 0px', threshold: [0.05, 0.2, 0.5] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const clearResults = () => {
    setBefore(null); setAfter(null); setComparison(null); setDiagnosis(null);
    setTrialPairs([]); setTrialReport(null); setConfirmationProgress(0);
    setControlledReport(null); setIsolationStep(0);
    setHypothesisSession(null); setFollowUpRuns([]); setHypothesisReview(null);
  };

  const refreshHistory = useCallback(async (key: string) => {
    const result = await gateway<{ runs: ExperimentRun[] }>(key, 'history');
    setHistory(result.runs);
  }, []);

  async function connect() {
    setBusy('connecting'); setError('');
    try {
      await gateway(accessKey, 'health');
      const [status] = await Promise.all([
        gateway<{ status: 'configured' | 'disabled' }>(accessKey, 'status'),
        refreshHistory(accessKey),
      ]);
      setAiConfigured(status.status === 'configured');
      setConnected(true);
      setNotice('Connected to the private LoadPilot API.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connection failed');
    } finally {
      setBusy(null);
    }
  }


  function selectScenario(kind: 'latency' | 'queue') {
    if (busy) return;
    setPlan({
      scenario: 'baseline',
      concurrency: kind === 'queue' ? 1 : 4,
      durationSeconds: 5,
      requestsPerSecond: kind === 'queue' ? 5 : 20,
      metricFocus: 'latency',
      hypothesis: kind === 'queue'
        ? 'Test whether serialization is visible at low traffic before probing higher load.'
        : 'Compare tail latency when a bundled sample API processes requests serially versus with shorter concurrent work.',
    });
    setObjective(kind === 'queue'
      ? 'At light traffic the API seems healthy. Can a controlled increase in load expose a hidden queue?'
      : 'Why does our sample API slow under load, and what improvement do the measurements support?');
    setPlanSource('manual');
    clearResults();
    setNotice(kind === 'queue'
      ? 'Hidden queue scenario selected. Run isolated factors, then ask Muse for a controlled follow-up.'
      : 'Latency gap scenario selected. Run both experiments to collect a real before-and-after comparison.');
  }

  function chooseJourneyPath(path: JourneyPath) {
    if (busy) return;
    setJourneyPath(path);
    const destination = path === 'local' ? (connected ? 'my-application' : 'connect-workspace')
      : path === 'sample' ? 'quickstart' : (comparison ? 'analysis' : 'experiments');
    window.requestAnimationFrame(() => {
      document.getElementById(destination)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (path === 'local') {
      setNotice(connected
        ? 'Your private API workspace is ready. Set a bounded run, then measure the before-and-after change.'
        : 'Connect the private workspace first. Your key stays in this browser tab and no traffic runs yet.');
    } else if (path === 'sample') {
      setNotice('Choose a sample question to see the complete investigation without touching an external service.');
    } else {
      setNotice(comparison
        ? 'Your comparison is ready. Ask Muse Spark to explain the measured difference and cite its evidence.'
        : 'Run a comparison first. AI Investigator only works from completed measurements, never from guesses.');
    }
  }

  async function generatePlan() {
    setBusy('planning'); setError(''); clearResults();
    try {
      const result = await gateway<{ plan: TestPlan; model: string }>(accessKey, 'plan', {
        targetId: 'demo-api', objective,
      });
      setPlan(result.plan);
      setPlanSource('muse');
      setNotice('Muse Spark proposed a validated test plan. Review its limits before executing.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI plan generation failed');
    } finally {
      setBusy(null);
    }
  }

  function editPlan<Key extends keyof TestPlan>(key: Key, value: TestPlan[Key]) {
    setPlan((old) => ({ ...old, [key]: value }));
    setPlanSource('manual'); clearResults();
  }

  async function runComparison() {
    setError(''); clearResults(); setBusy('running-slow');
    try {
      const first = await gateway<ExperimentRun>(accessKey, 'run', {
        targetId: 'demo-api', variant: 'slow', plan,
      });
      setBefore(first);
      if (first.status !== 'completed') {
        setNotice('Slow experiment was cancelled. No comparison generated.');
        return;
      }
      setBusy('running-optimized');
      const second = await gateway<ExperimentRun>(accessKey, 'run', {
        targetId: 'demo-api', variant: 'optimized', plan,
      });
      setAfter(second);
      if (second.status !== 'completed') {
        setNotice('Optimized experiment was cancelled. No comparison generated.');
        return;
      }
      setBusy('comparing');
      const result = await gateway<Comparison>(accessKey, 'compare', {
        beforeRunId: first.id, afterRunId: second.id,
      });
      setComparison(result);
      setTrialPairs([{ beforeRunId: first.id, afterRunId: second.id }]);
      setNotice('Two measurements completed. You can now request an evidence-based AI explanation.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Experiment did not complete');
    } finally {
      setBusy(null);
      try { await refreshHistory(accessKey); } catch { /* previous result remains visible */ }
    }
  }

  async function cancelActive() {
    try {
      await gateway(accessKey, 'cancel');
      setNotice('Cancellation requested. Current in-flight requests will finish.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to cancel experiment');
    }
  }

  async function requestDiagnosis() {
    if (!before || !after || !comparison) return;
    setBusy('diagnosing'); setError(''); setDiagnosis(null);
    try {
      const result = await gateway<Finding>(accessKey, 'diagnose', {
        beforeRunId: before.id, afterRunId: after.id,
      });
      setDiagnosis(result);
      setNotice(result.cached
        ? 'Loaded a previously validated AI diagnosis.'
        : 'Muse Spark returned a validated, evidence-citing hypothesis.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI diagnosis failed');
    } finally {
      setBusy(null);
    }
  }

  async function confirmTrials() {
    if (!comparison || trialPairs.length === 0 || trialPairs.length >= 3) return;
    setError(''); setTrialReport(null); setBusy('confirming');
    const collected = trialPairs.slice();
    try {
      while (collected.length < 3) {
        setConfirmationProgress(collected.length);
        setNotice('Collecting confirmation pair ' + (collected.length + 1) + ' of 3…');
        const slow = await gateway<ExperimentRun>(accessKey, 'run', {
          targetId: 'demo-api', variant: 'slow', plan,
        });
        if (slow.status !== 'completed') throw new Error('Confirmation slow run cancelled');
        const optimized = await gateway<ExperimentRun>(accessKey, 'run', {
          targetId: 'demo-api', variant: 'optimized', plan,
        });
        if (optimized.status !== 'completed') throw new Error('Confirmation optimized run cancelled');
        collected.push({ beforeRunId: slow.id, afterRunId: optimized.id });
        setTrialPairs(collected.slice());
        setConfirmationProgress(collected.length);
      }
      const report = await gateway<TrialReport>(accessKey, 'adjudicate', { pairs: collected });
      setTrialReport(report);
      setNotice('Repeat trials adjudicated. The report is ready to export as JSON with a SHA-256 checksum.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Repeated trials failed');
    } finally {
      setBusy(null);
      try { await refreshHistory(accessKey); } catch { /* previous results remain visible */ }
    }
  }


  async function runControlledInvestigation() {
    setError(''); setControlledReport(null); setIsolationStep(0);
    setHypothesisSession(null); setFollowUpRuns([]); setHypothesisReview(null); setBusy('isolating');
    try {
      const orderedVariants = ['slow', 'parallel_slow', 'optimized'] as const;
      const runs: ExperimentRun[] = [];
      for (const variant of orderedVariants) {
        setNotice('Controlled investigation: measuring ' + variant.replaceAll('_',' ') + '…');
        const result = await gateway<ExperimentRun>(accessKey, 'run', {
          targetId: 'demo-api', variant, plan,
        });
        if (result.status !== 'completed') {
          throw new Error('Controlled ' + variant + ' experiment was cancelled');
        }
        runs.push(result);
        setIsolationStep(runs.length);
      }
      const report = await gateway<ControlledReport>(accessKey, 'controlled', {
        serializedRunId: runs[0].id,
        parallelSameWorkRunId: runs[1].id,
        parallelFastWorkRunId: runs[2].id,
      });
      setControlledReport(report);
      setNotice('Two single-factor comparisons completed. The findings are descriptive synthetic evidence, not root-cause proof.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Controlled investigation failed');
    } finally {
      setBusy(null);
      try { await refreshHistory(accessKey); } catch { /* recent measurements remain visible */ }
    }
  }


  function chooseLowLoad() {
    setPlan(p => ({
      ...p, concurrency: 1, requestsPerSecond: 5, durationSeconds: 5,
      hypothesis: 'Test whether serialization is visible at low load before increasing traffic.',
    }));
    setPlanSource('manual');
    clearResults();
    setNotice('Low-load plan selected (1 worker, 5 req/s, 5 seconds). Click Isolate bottleneck factors to collect the first evidence.');
  }

  async function askHypothesis() {
    if (!controlledReport) return;
    setBusy('hypothesizing'); setError('');
    setHypothesisSession(null); setFollowUpRuns([]); setHypothesisReview(null);
    try {
      const [serial, sameWork, fast] = controlledReport.sourceRuns;
      const suggestion = await gateway<HypothesisSession>(accessKey, 'hypothesize', {
        serializedRunId: serial.id,
        parallelSameWorkRunId: sameWork.id,
        parallelFastWorkRunId: fast.id,
      });
      setHypothesisSession(suggestion);
      setNotice('Muse Spark proposed a measurable follow-up. Review the authorized plan and launch it separately.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Muse hypothesis proposal failed');
    } finally { setBusy(null); }
  }

  async function runHypothesisFollowUp() {
    if (!hypothesisSession || !controlledReport) return;
    setBusy('retesting'); setError(''); setFollowUpRuns([]); setHypothesisReview(null);
    const runs: ExperimentRun[] = [];
    try {
      for (const variant of hypothesisSession.followUp.variants) {
        setNotice('Running approved retest: ' + variant.replaceAll('_', ' ') + '…');
        const run = await gateway<ExperimentRun>(accessKey, 'run', {
          targetId: 'demo-api', variant, plan: hypothesisSession.followUp.plan,
        });
        if (run.status !== 'completed') throw new Error('Retest was cancelled. No hypothesis assessment can be made.');
        runs.push(run);
        setFollowUpRuns(runs.slice());
      }
      setNotice('Retest measured. Use the separate AI review action to evaluate the new evidence.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Retest failed');
    } finally {
      setBusy(null);
      try { await refreshHistory(accessKey); } catch { /* run metrics remain visible */ }
    }
  }

  async function reviewHypothesis() {
    if (!hypothesisSession || followUpRuns.length !== 2) return;
    setBusy('reassessing'); setError(''); setHypothesisReview(null);
    try {
      const review = await gateway<HypothesisReview>(accessKey, 'reassess', {
        investigationId: hypothesisSession.investigationId,
        followUpBeforeRunId: followUpRuns[0].id,
        followUpAfterRunId: followUpRuns[1].id,
      });
      setHypothesisReview(review);
      setNotice('Muse evaluated the new evidence; its verdict passed the numeric verification gate.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI evidence reassessment failed');
    } finally { setBusy(null); }
  }

  function exportControlledEvidence() {
    if (!controlledReport) return;
    const content = new Blob([JSON.stringify(controlledReport, null, 2) + '\n'], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'loadpilot-controlled-' + controlledReport.integrity.digest.slice(0, 12) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportEvidence() {
    if (!trialReport) return;
    const file = new Blob([JSON.stringify(trialReport, null, 2) + '\n'], {
      type: 'application/json',
    });
    const href = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'loadpilot-evidence-' + trialReport.integrity.digest.slice(0, 12) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoke later to allow the browser download to begin.
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  const running = busy === 'running-slow' || busy === 'running-optimized' || busy === 'comparing';
  const progress = diagnosis ? 4 : comparison ? 3 : before ? 2 : planSource === 'muse' ? 1 : 0;
  const reduction = comparison?.p95ReductionPercent;
  const throughputPercent = before && after && before.metrics.observedRps > 0
    ? (after.metrics.observedRps / before.metrics.observedRps - 1) * 100 : null;

  return (
    <div className="shell">
      <div className="content">
        <header className="topbar">
          {/* Brand SVG lives in public/loadpilot-logo.svg; use this mark for the supplied LoadPilot identity. */}
          <a className="brand" href="#overview" aria-label="LoadPilot overview" onClick={() => setActiveSection('overview')}><Image className="brand-logo" src="/loadpilot-logo.svg" alt="" width={48} height={48} priority /><div><strong>LoadPilot <span className="brand-ai">AI</span></strong></div></a>
          <nav className="top-nav" aria-label="Workspace navigation">
            {[
              ['overview', 'Overview'], ['my-application', 'Test API'], ['experiments', 'Measure'],
              ['analysis', 'Investigate'], ['history', 'History'],
            ].map(([id, label]) => <a key={id} className={activeSection === id ? 'top-nav-active' : ''} href={'#' + id} onClick={() => setActiveSection(id)}>{label}</a>)}
          </nav>
          <div className="topbar-right"><span className={'connection-dot ' + (connected ? 'online' : '')}/><span>{connected ? 'CONNECTED' : 'READY TO CONNECT'}</span><span className="topbar-divider"/><span className="user-avatar">LP</span></div>
        </header>

        <main id="overview" className="dashboard">
          <section className="product-hero" aria-label="Introduction to LoadPilot AI">
            <div className="product-hero-copy">
              <p className="eyebrow"><span className="hero-accent-star">✦</span> THE AI PERFORMANCE INVESTIGATION STUDIO</p>
              <h1>AI investigates why your API is slow.<br/><span>Measured evidence, not guesses.</span></h1>
              <p className="headline-desc">Test an API you control over real local HTTP. Capture a baseline, investigate a suspected bottleneck, then run the same bounded test after your change. Muse Spark explains measured evidence; it never controls execution.</p>
              <div className="hero-benefits">
                <span><SymbolIcon kind="pulse"/> Simulate load</span>
                <span><SymbolIcon kind="chart"/> Measure the gap</span>
                <span><SymbolIcon kind="spark"/> Investigate with AI</span>
              </div>
              <div className="hero-actions">
                <a className="button primary hero-primary-action" href="#my-application">
                  Test your API <SymbolIcon kind="arrow"/>
                </a>
                <a className="hero-how-link" href="#quickstart">Try an example</a>
              </div>
              <div className="hero-model"><span className={'pill-dot ' + (aiConfigured ? 'online' : '')}/> Powered by Meta Muse Spark 1.3 <span>·</span> No external traffic</div>
            </div>
            

            <div className="real-http-hero signal-stage" aria-label="Interactive investigation flow" onPointerMove={event => {
              const bounds = event.currentTarget.getBoundingClientRect();
              event.currentTarget.style.setProperty('--spot-x', ((event.clientX-bounds.left) / bounds.width*100).toFixed(1)+'%');
              event.currentTarget.style.setProperty('--spot-y', ((event.clientY-bounds.top) / bounds.height*100).toFixed(1)+'%');
            }}>
              <div className="signal-stage-top">
                <span className="signal-stage-kicker"><span className="signal-mini-orb"/> LOADPILOT / SIGNAL ROOM</span>
                <span className="signal-stage-mode">{connected ? 'WORKSPACE CONNECTED' : 'PRIVATE DEMO · AWAITING CONNECTION'}</span>
              </div>
              <div className="signal-stage-core">
                <div className="signal-orbit" aria-hidden="true">
                  <div className="signal-orbit-halo"/>
                  <div className="signal-orbit-ring ring-outer"/>
                  <div className="signal-orbit-ring ring-middle"/>
                  <div className="signal-orbit-ring ring-inner"/>
                  <div className="signal-orbit-cross cross-horizontal"/>
                  <div className="signal-orbit-cross cross-vertical"/>
                  <div className="signal-orbit-center"><SymbolIcon kind="pulse"/></div>
                  <span className="signal-orbit-ping"/>
                </div>
                <div className="signal-core-label">
                  <span>INVESTIGATION / 001</span>
                  <strong>Find the <i>signal.</i></strong>
                  <p>Measure what happened. Challenge the hypothesis. Verify the change.</p>
                </div>
              </div>
              <div className="signal-wave-box" aria-hidden="true">
                <svg viewBox="0 0 470 65" preserveAspectRatio="none">
                  <path className="signal-wave-grid" d="M0 16H470 M0 33H470 M0 50H470"/>
                  <path className="signal-wave-base" d="M0 37 L47 37 L64 27 L85 44 L111 34 L135 34 L157 18 L172 45 L199 37 L229 37 L245 9 L264 55 L280 29 L299 37 L323 37 L350 25 L367 44 L390 36 L470 36"/>
                  <path className="signal-wave-accent" d="M0 37 L47 37 L64 27 L85 44 L111 34 L135 34 L157 18 L172 45 L199 37 L229 37 L245 9 L264 55 L280 29 L299 37 L323 37 L350 25 L367 44 L390 36 L470 36"/>
                </svg>
                <div className="signal-wave-caption"><span>VISUALIZATION / CONCEPT ONLY</span><span>NO MEASUREMENTS UNTIL TESTED</span></div>
              </div>
              <div className="signal-stage-flow">
                <div><span className="signal-step-index">01 / OBSERVE</span><strong>Run a baseline</strong><small>Bounded real HTTP</small></div>
                <div><span className="signal-step-index">02 / REASON</span><strong>Investigate</strong><small>Review actual evidence</small></div>
                <div><span className="signal-step-index">03 / VERIFY</span><strong>Test the change</strong><small>Matched follow-up</small></div>
              </div>
              <div className="signal-stage-bottom"><SymbolIcon kind="shield"/> Model guidance is evidence-checked. Execution stays in your hands.</div>
            </div>
          </section>


          <section className="safety-boundary" aria-label="AI execution safety boundary">
            <div><span className="overline"><SymbolIcon kind="shield"/> ENFORCED SECURITY BOUNDARY</span><h2>AI cannot execute tests.</h2><p>Muse Spark proposes and explains; only an explicit user action can start a deterministic policy-checked runner.</p></div>
            <div className="safety-facts"><span>Owner-consented loopback GET only</span><span>Maximum 10 req/s · 4 workers · 10 seconds</span><span>No AI-chosen targets, shell access or redirects</span></div>
          </section>
          {!connected && (
            <section className="connect-panel" id="connect-workspace" aria-label="Connect to private LoadPilot API">
              <div className="connect-icon"><SymbolIcon kind="lock"/></div>
              <div className="connect-copy"><strong>Connect your workspace</strong><p>Enter the separate DASHBOARD_ACCESS_TOKEN from apps/web/.env.local. This is not your Meta API key. The key stays in this tab&apos;s memory.</p><details className="connect-help"><summary>Where do I find the access key?</summary><p>In Codespaces, open apps/web/.env.local privately and use the value of DASHBOARD_ACCESS_TOKEN. Also start Fastify on port 4000. Never share or commit either token.</p></details></div>
              <div className="connect-actions"><input type="password" aria-label="Dashboard access key" autoComplete="off" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} placeholder="Dashboard access key" onKeyDown={(event) => { if (event.key === 'Enter' && !busy) void connect(); }}/><button type="button" className="button primary" onClick={() => void connect()} disabled={Boolean(busy) || !accessKey}>Connect <SymbolIcon kind="arrow"/></button></div>
            </section>
          )}
          {connected && (
            <div className="connected-banner"><span><span className="tiny-success"/> Private backend verified · Authorized testing only · {aiConfigured ? 'Meta AI ready' : 'Meta AI not configured'}</span><button className="text-button" onClick={() => { setConnected(false); setAiConfigured(false); setAccessKey(''); clearResults(); setHistory([]); }} type="button" disabled={Boolean(busy)}>Lock workspace</button></div>
          )}

          <section className="mission-control" aria-label="Choose an investigation path">
            <div className="mission-header">
              <div>
                <p className="section-kicker">START HERE · 60-SECOND WORKFLOW</p>
                <h2>What do you want to investigate?</h2>
                <p>Pick a path and LoadPilot will take you to the next safe action. You can change direction at any time.</p>
              </div>
              <div className="mission-status"><span className="live-ring"/> {connected ? 'WORKSPACE READY' : 'ONE STEP FROM START'}</div>
            </div>
            <div className="mission-paths">
              <button type="button" className={'mission-path ' + (journeyPath === 'local' ? 'mission-path-active' : '')} onClick={() => chooseJourneyPath('local')} disabled={Boolean(busy)}>
                <span className="mission-path-top"><span className="mission-path-number">01</span><span className="mission-path-icon"><SymbolIcon kind="cpu"/></span></span>
                <strong>Test my local API</strong>
                <span>Measure a real owner-controlled localhost endpoint before and after a change.</span>
                <small>{connected ? 'READY · JUMP TO TEST YOUR API' : 'CONNECT WORKSPACE FIRST'} <SymbolIcon kind="arrow"/></small>
              </button>
              <button type="button" className={'mission-path ' + (journeyPath === 'sample' ? 'mission-path-active' : '')} onClick={() => chooseJourneyPath('sample')} disabled={Boolean(busy)}>
                <span className="mission-path-top"><span className="mission-path-number">02</span><span className="mission-path-icon mission-path-icon-mint"><SymbolIcon kind="pulse"/></span></span>
                <strong>Explore a sample case</strong>
                <span>See a safe, repeatable latency investigation with no external traffic.</span>
                <small>CHOOSE A SCENARIO <SymbolIcon kind="arrow"/></small>
              </button>
              <button type="button" className={'mission-path ' + (journeyPath === 'investigate' ? 'mission-path-active' : '')} onClick={() => chooseJourneyPath('investigate')} disabled={Boolean(busy)}>
                <span className="mission-path-top"><span className="mission-path-number">03</span><span className="mission-path-icon mission-path-icon-pink"><SymbolIcon kind="spark"/></span></span>
                <strong>Explain a measured gap</strong>
                <span>Use Muse Spark to form a cited hypothesis only after evidence exists.</span>
                <small>{comparison ? 'COMPARISON READY · ASK MUSE' : 'MEASURE FIRST'} <SymbolIcon kind="arrow"/></small>
              </button>
            </div>
            <div className="mission-next">
              <div className="mission-next-mark"><SymbolIcon kind={journeyPath === 'investigate' ? 'spark' : journeyPath === 'sample' ? 'pulse' : connected ? 'play' : 'lock'}/></div>
              <div className="mission-next-copy"><span className="mission-next-label">YOUR NEXT MOVE</span><strong>{journeyPath === 'local' ? (connected ? 'Configure your first bounded run' : 'Connect your private workspace') : journeyPath === 'sample' ? 'Choose the question you want to answer' : (comparison ? 'Ask Muse Spark to investigate the evidence' : 'Run both variants to create evidence')}</strong><p>{journeyPath === 'local' ? 'No public traffic. The runner accepts only the owner-authorized target and hard limits.' : journeyPath === 'sample' ? 'Start with a clear question, then compare actual p95 latency and throughput.' : 'The model can explain and propose. It cannot execute a test or invent a measurement.'}</p></div>
              <button type="button" className="mission-next-button" onClick={() => chooseJourneyPath(journeyPath)} disabled={Boolean(busy)}>{journeyPath === 'local' ? (connected ? 'Open test controls' : 'Connect workspace') : journeyPath === 'sample' ? 'Open sample cases' : (comparison ? 'Open investigator' : 'Open experiments')} <SymbolIcon kind="arrow"/></button>
            </div>
          </section>

          {error && <div className="alert" role="alert"><strong>Action needs attention</strong><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
          <div className="notice"><span className="live-ring"/><span role="status">{notice}</span></div>


          <LocalApplicationPanel connected={connected} accessKey={accessKey} aiConfigured={aiConfigured}/>

          <section className="scenario-start" id="quickstart">
            <div className="scenario-heading">
              <div>
                <p className="section-kicker">OPTIONAL · LEARN THE WORKFLOW</p>
                <h2>Try a sample investigation</h2>
                <p>New to LoadPilot? Use an included sample endpoint to understand the investigation workflow. To measure your own application instead, use <a href="#my-application" className="hero-how-link">Test your API</a> above. Selecting a sample does not execute traffic or use AI credits.</p>
              </div>
              <span className="scenario-mode"><SymbolIcon kind="shield"/> OPTIONAL SAMPLE</span>
            </div>
            <div className="scenario-cards">
              <button type="button" className={'scenario-card ' + (plan.concurrency === 4 && plan.requestsPerSecond === 20 ? 'scenario-selected' : '')}
                aria-pressed={plan.concurrency === 4 && plan.requestsPerSecond === 20}
                onClick={() => selectScenario('latency')} disabled={Boolean(busy)}>
                <span className="scenario-number">01 <span>POPULAR START</span></span>
                <span className="scenario-icon scenario-icon-latency"><SymbolIcon kind="chart"/></span>
                <strong>Why is my API slow?</strong>
                <span className="scenario-story">Compare a slow and optimized service under controlled traffic. See the latency difference.</span>
                <span className="scenario-meta">4 workers <i/> 20 req/s <i/> 5 sec</span>
                <span className="scenario-cta">Select latency investigation <SymbolIcon kind="arrow"/></span>
              </button>
              <button type="button" className={'scenario-card ' + (plan.concurrency === 1 && plan.requestsPerSecond === 5 ? 'scenario-selected' : '')}
                aria-pressed={plan.concurrency === 1 && plan.requestsPerSecond === 5}
                onClick={() => selectScenario('queue')} disabled={Boolean(busy)}>
                <span className="scenario-number">02 <span>AI DEEP DIVE</span></span>
                <span className="scenario-icon scenario-icon-queue"><SymbolIcon kind="cpu"/></span>
                <strong>What bottleneck is hiding?</strong>
                <span className="scenario-story">Start with light traffic. Isolate queueing from work delay, then let Muse suggest a more revealing test.</span>
                <span className="scenario-meta">1 worker <i/> 5 req/s <i/> 5 sec</span>
                <span className="scenario-cta">Select hidden-queue investigation <SymbolIcon kind="arrow"/></span>
              </button>
            </div>
            <div className="sample-preview"><SystemJourney plan={plan} before={before} after={after} busy={busy}/></div>
            <div className="scenario-next" role="status">
              <div className="scenario-next-symbol"><SymbolIcon kind={connected ? 'check' : 'lock'}/></div>
              <div>
                <strong>{connected ? 'Ready to run your experiment' : 'Connect your workspace to begin'}</strong>
                <p>{connected
                  ? 'Your chosen settings are ready. Start the bounded test, then inspect the real measurements.'
                  : 'The scenario can be selected now. To run it, enter the dashboard access key in the connection panel above.'}</p>
              </div>
              <a href={connected ? (plan.concurrency === 1 && plan.requestsPerSecond === 5 ? '#controlled' : '#experiments') : '#connect-workspace'}
                className="scenario-next-link">{connected ? 'Go to experiment' : 'Go to connection'} <SymbolIcon kind="arrow"/></a>
            </div>
          </section>

          <section className="how-it-works" id="how-it-works" aria-label="How LoadPilot works">
            <div className="how-heading"><p className="section-kicker">THE METHOD</p><h2>From suspicion to evidence in four steps.</h2></div>
            <div className="how-grid">
              <div><span className="how-index">01 / ASK</span><div className="how-icon"><SymbolIcon kind="cpu"/></div><strong>Select an API</strong><p>Configure your authorized local API or select a sample scenario.</p></div>
              <div><span className="how-index">02 / MEASURE</span><div className="how-icon"><SymbolIcon kind="pulse"/></div><strong>Put it under load</strong><p>Run real bounded requests and collect latency.</p></div>
              <div><span className="how-index">03 / COMPARE</span><div className="how-icon"><SymbolIcon kind="chart"/></div><strong>Spot the bottleneck</strong><p>Compare variants, error rates and p95 response time.</p></div>
              <div><span className="how-index">04 / INVESTIGATE</span><div className="how-icon"><SymbolIcon kind="spark"/></div><strong>Ask Muse what's next</strong><p>Get an evidence-citing hypothesis and approve a retest.</p></div>
            </div>
          </section>

          <div className="section-top"><div><p className="section-kicker">THE INVESTIGATION</p><h2>Your live experiment workspace</h2></div><span className="mode-chip"><SymbolIcon kind="shield"/> IN-PROCESS SAMPLE · NO PUBLIC TRAFFIC</span></div>

          <div className="stepper" aria-label="Workflow progress">
            {[{name:'Plan',sub:'Define a safe test'}, {name:'Execute',sub:'Collect real metrics'}, {name:'Compare',sub:'Measure the difference'}, {name:'Diagnose',sub:'Evidence-based insights'}].map((step,i)=><div className={'step '+(progress>i?'step-complete':(progress===i?'step-current':''))} key={step.name}><span className="step-number">{progress>i?'✓':String(i+1).padStart(2,'0')}</span><span><strong>{step.name}</strong><small>{step.sub}</small></span></div>)}
          </div>

          <div className="main-grid" id="experiments">
            <section className="panel experiment-panel">
              <div className="panel-header"><div><div className="overline"><SymbolIcon kind="cpu"/> STEP 1 · SAMPLE CONFIGURATION</div><h3>Run an example investigation</h3><p>These controls run the included sample endpoint. Use Test your API above for your own application.</p></div><span className="status-chip">TARGET LOCKED</span></div>
              <label htmlFor="objective" className="field-label">PERFORMANCE QUESTION</label>
              <textarea id="objective" className="objective" rows={3} maxLength={600} value={objective} disabled={!connected || Boolean(busy)} onChange={(event)=>setObjective(event.target.value)} placeholder="What should LoadPilot investigate?"/>
              <button type="button" className="button ai-button" disabled={!connected || !aiConfigured || Boolean(busy) || objective.trim().length < 10} onClick={()=>void generatePlan()}>{busy==='planning'?<span className="spinner"/>:<SymbolIcon kind="spark"/>} {busy==='planning'?'Generating a bounded plan…':'Generate plan with Muse Spark'} <span className="button-hint">USES MODEL API</span></button>

              <div className="plan-divider"><span/> TEST PARAMETERS <span/></div>
              <div className="plan-source"><span className="mini-dot"/>{planSource === 'muse'?'MUSE SPARK PROPOSAL':'SAFE DEFAULT PLAN'}<span className="plan-safe">HARD-LIMITED</span></div>
              <div className="controls">
                <div className="range-control"><div className="range-head"><label htmlFor="concurrency">Concurrency</label><strong>{plan.concurrency} <small>workers</small></strong></div><input id="concurrency" type="range" min="1" max="20" step="1" value={plan.concurrency} disabled={!connected || Boolean(busy)} onChange={(e)=>editPlan('concurrency',Number(e.target.value))}/><div className="range-ends"><span>1</span><span>20</span></div></div>
                <div className="range-control"><div className="range-head"><label htmlFor="rate">Request rate</label><strong>{plan.requestsPerSecond} <small>req/s</small></strong></div><input id="rate" type="range" min="1" max="50" step="1" value={plan.requestsPerSecond} disabled={!connected || Boolean(busy)} onChange={(e)=>editPlan('requestsPerSecond',Number(e.target.value))}/><div className="range-ends"><span>1</span><span>50</span></div></div>
                <div className="range-control"><div className="range-head"><label htmlFor="duration">Duration</label><strong>{plan.durationSeconds} <small>seconds</small></strong></div><input id="duration" type="range" min="5" max="30" step="1" value={plan.durationSeconds} disabled={!connected || Boolean(busy)} onChange={(e)=>editPlan('durationSeconds',Number(e.target.value))}/><div className="range-ends"><span>5 s</span><span>30 s</span></div></div>
                <div className="range-control"><label htmlFor="metric-focus" className="field-label">PRIMARY METRIC</label><select id="metric-focus" value={plan.metricFocus} disabled={!connected || Boolean(busy)} onChange={(e)=>editPlan('metricFocus',e.target.value as TestPlan['metricFocus'])}><option value="latency">Latency (p95)</option><option value="throughput">Throughput</option><option value="error_rate">Error rate</option></select></div>
              </div>
              <p className="plan-hypothesis"><strong>Hypothesis</strong> {plan.hypothesis}</p>
              <div className="panel-footer"><p><SymbolIcon kind="shield"/> Maximum 500 requests per run · one active run</p><button type="button" className="button primary run-button" disabled={!connected || Boolean(busy)} onClick={()=>void runComparison()}>{running?<span className="spinner"/>:<SymbolIcon kind="play"/>}{busy==='running-slow'?'Running slow variant…':busy==='running-optimized'?'Running optimized variant…':busy==='comparing'?'Comparing runs…':'Run both experiments'}</button></div>
              {running && <button type="button" className="cancel-button" onClick={()=>void cancelActive()}>Request cancellation of active run</button>}
            </section>

            <section className="panel results-panel">
              <div className="panel-header"><div><div className="overline"><SymbolIcon kind="chart"/> STEP 2 · OBSERVE</div><h3>See what changed</h3><p>Actual p95 latency, throughput and errors from completed local runs—never demo placeholders.</p></div><span className={'result-state '+(comparison?'result-ready':'')}>{comparison?'MEASURED':'AWAITING DATA'}</span></div>
              {before && after ? (
                <>
                  <div className="mini-stats">
                    <MetricBox label="SLOW · P95" value={formatNumber(before.metrics.latencyMs.p95)+' ms'} detail={before.metrics.requestCount+' completed requests'} accent="pink"/>
                    <MetricBox label="OPTIMIZED · P95" value={formatNumber(after.metrics.latencyMs.p95)+' ms'} detail={after.metrics.requestCount+' completed requests'} accent="mint"/>
                  </div>
                  <LatencyChart before={before} after={after}/>
                  {comparison && <div className="improvement"><div><span>Observed p95 reduction</span><strong>{reduction == null?'—':formatNumber(reduction)+'%'}</strong><small>Controlled in-process demo comparison</small></div><div className="improvement-mark"><SymbolIcon kind="chart"/></div></div>}
                  <div className="comparison-row"><div><span>Slow throughput</span><strong>{formatNumber(before.metrics.observedRps)} req/s</strong></div><div><span>Optimized throughput</span><strong>{formatNumber(after.metrics.observedRps)} req/s</strong></div><div><span>Observed change</span><strong>{throughputPercent === null?'—':(throughputPercent>=0?'+':'')+formatNumber(throughputPercent)+'%'}</strong></div></div>
                  <p className="muted-note">Both variants also differ in simulated processing time. This comparison alone does not establish causality.</p>
                </>
              ) : (
                <div className="empty-results"><div className="empty-icon"><SymbolIcon kind="pulse"/></div><h4>Your evidence will appear here</h4><p>Connect your workspace and run a sample investigation to populate this comparison. The separate Test your API panel measures your own authorized endpoint.</p><div className="empty-pills"><span>p50 · p95 · p99</span><span>REQUEST RATE</span><span>ERRORS</span></div></div>
              )}
            </section>
          </div>

          <section className="panel diagnosis-panel" id="analysis">
            <div className="diagnosis-intro"><div><div className="overline"><SymbolIcon kind="spark"/> AI INVESTIGATOR</div><h3>Evidence, not guesswork.</h3><p>Muse Spark analyzes measured numbers and cites exact metrics. Conclusions remain testable hypotheses.</p></div><button type="button" className="button outline-button" disabled={!connected || !aiConfigured || !comparison || Boolean(busy)} onClick={()=>void requestDiagnosis()}>{busy==='diagnosing'?<span className="spinner"/>:<SymbolIcon kind="spark"/>}{busy==='diagnosing'?'Analyzing evidence…':diagnosis?'Reopen AI diagnosis':'Investigate with AI'} <SymbolIcon kind="arrow"/></button></div>
            {diagnosis ? (
              <div className="diagnosis-content">
                <div className="finding-card"><div className="finding-top"><span className="finding-tag"><SymbolIcon kind="spark"/> EVIDENCE-CITING HYPOTHESIS</span><span className="confidence-chip">{diagnosis.finding.confidence.toUpperCase()} CONFIDENCE</span></div><h4>{diagnosis.finding.category.replaceAll('_',' ')}</h4><p>{diagnosis.finding.explanation}</p><span className="finding-model">Generated by {diagnosis.model} · {diagnosis.cached?'retrieved from cache':'independently checked against numeric evidence'}</span></div>
                <div className="evidence-card"><h4>Referenced measurements</h4><div className="evidence-list">{diagnosis.citedEvidence.map((item)=><div className="evidence-row" key={item.id}><span>{item.id.replaceAll('_',' ').replaceAll('.',' · ')}</span><strong>{formatNumber(item.value)} <small>{item.unit}</small></strong></div>)}</div></div>
                <div className="next-experiment"><span className="next-tag">PROPOSED NEXT EXPERIMENT</span><strong>{diagnosis.nextExperiment.action.replaceAll('_',' ')}</strong><p>{diagnosis.nextExperiment.reason}</p><small>Proposal only · No automatic testing</small></div>
                <p className="muted-note">{diagnosis.caveats.join(' ')}</p>
              </div>
            ) : (
              <div className="diagnosis-empty"><div className="diagnosis-orbit"><SymbolIcon kind="spark"/></div><div><strong>Meet your AI performance investigator</strong><p>{comparison?'Measured evidence is ready. Request a diagnosis to generate a testable, cited hypothesis.':'Complete a comparison first. The agent never analyzes invented or unmeasured data.'}</p></div></div>
            )}
          </section>

          <section className="panel controlled-panel" id="controlled">
            <div className="history-top">
              <div>
                <div className="overline"><SymbolIcon kind="cpu"/> CONTROLLED BOTTLENECK INVESTIGATION</div>
                <h3>What actually changes the latency?</h3>
                <p>Test competing explanations by changing one configured synthetic factor at a time, with the same load settings.</p>
              </div>
              <button type="button" className="button refresh-button"
                disabled={!connected || Boolean(busy)} onClick={chooseLowLoad}>
                Use low-load baseline
              </button>
              <button type="button" className="button outline-button"
                disabled={!connected || Boolean(busy)}
                onClick={() => void runControlledInvestigation()}>
                {busy === 'isolating' ? <span className="spinner"/> : <SymbolIcon kind="play"/>}
                {busy === 'isolating' ? 'Running controlled experiments…' : 'Isolate bottleneck factors'}
              </button>
            </div>
            <div className="controlled-steps" role="group" aria-label="Controlled sample variants">
              {[
                {name:'Serialized',detail:'80 ms work · serial queue'},
                {name:'Parallel control',detail:'80 ms work · concurrent'},
                {name:'Parallel optimized',detail:'8 ms work · concurrent'},
              ].map((step, index) => (
                <div className={'controlled-step ' + (isolationStep > index ? 'controlled-step-done' : '')} key={step.name}>
                  <span>{index+1}</span><strong>{step.name}</strong><small>{step.detail}</small>
                </div>
              ))}
            </div>
            {controlledReport ? (
              <div className="controlled-details">
                <div className="controlled-conclusion">
                  <span className="overline">DESCRIPTIVE EVIDENCE CLASSIFICATION</span>
                  <h4>{controlledReport.conclusion.classification.replaceAll('_',' ')}</h4>
                  <p>{controlledReport.conclusion.interpretation}</p>
                </div>
                <div className="controlled-contrasts">
                  {controlledReport.contrasts.map(contrast => (
                    <article className="contrast-card" key={contrast.hypothesis}>
                      <span className="field-label">{contrast.hypothesis === 'serialization_overhead' ? 'HYPOTHESIS A · SERIAL QUEUE' : 'HYPOTHESIS B · PROCESSING DELAY'}</span>
                      <h4>{contrast.hypothesis === 'serialization_overhead' ? 'Does serialization increase latency?' : 'Does slower work increase latency?'}</h4>
                      <div className="contrast-numbers">
                        <div><small>BEFORE P95</small><strong>{formatNumber(contrast.beforeP95Ms)} ms</strong></div>
                        <SymbolIcon kind="arrow"/>
                        <div><small>AFTER P95</small><strong>{formatNumber(contrast.afterP95Ms)} ms</strong></div>
                      </div>
                      <p>Observed change: <strong>{formatNumber(contrast.reductionPercent)}% lower p95</strong></p>
                      <p>Held constant: {contrast.heldConstant.join(' · ')}</p>
                      <span className={'contrast-status ' + (contrast.signal === 'observed_at_demo_threshold' ? 'signal-positive' : '')}>{contrast.signal.replaceAll('_',' ')}</span>
                    </article>
                  ))}
                </div>
                <div className="hypothesis-panel">
                  <div className="hypothesis-head">
                    <div>
                      <span className="overline"><SymbolIcon kind="spark"/> MUSE SPARK · ADAPTIVE FOLLOW-UP</span>
                      <h4>Let the AI challenge the first finding</h4>
                      <p className="muted-note">Muse reads the two measured contrasts, selects a hypothesis and proposes an allowable retest. The model never starts traffic. Each model request uses API credits.</p>
                    </div>
                    <button type="button" className="button ai-button hypothesis-action"
                      disabled={!connected || !aiConfigured || Boolean(busy)} onClick={() => void askHypothesis()}>
                      {busy === 'hypothesizing' ? <span className="spinner"/> : <SymbolIcon kind="spark"/>}
                      {busy === 'hypothesizing' ? 'Muse is reviewing…' : 'Ask Muse to choose a hypothesis'}
                    </button>
                  </div>
                  {hypothesisSession && (
                    <div className="hypothesis-details">
                      <span className="finding-tag">AI SELECTED · {hypothesisSession.hypothesis.hypothesis.replaceAll('_',' ')}</span>
                      <h4>Initial evidence: {hypothesisSession.hypothesis.initialSignal.replaceAll('_',' ')}</h4>
                      <p>{hypothesisSession.hypothesis.rationale}</p>
                      <span className="field-label">PROPOSED EXPERIMENT · USER APPROVAL REQUIRED</span>
                      <p><strong>{hypothesisSession.hypothesis.followUpAction.replaceAll('_',' ')}</strong> — {hypothesisSession.hypothesis.whyThisTest}</p>
                      <p>Approved limits: {hypothesisSession.followUp.plan.concurrency} workers · {hypothesisSession.followUp.plan.requestsPerSecond} req/s · {hypothesisSession.followUp.plan.durationSeconds} seconds per run · only local demo-api.</p>
                      <p>Comparison: {hypothesisSession.followUp.variants.map(v=>v.replaceAll('_',' ')).join(' → ')}</p>
                      <button type="button" className="button primary" disabled={Boolean(busy) || followUpRuns.length === 2}
                        onClick={() => void runHypothesisFollowUp()}>
                        {busy === 'retesting' ? <span className="spinner"/> : <SymbolIcon kind="play"/>}
                        {busy === 'retesting' ? 'Running approved retest…' : 'Approve & run these 2 local tests'}
                      </button>
                      {followUpRuns.length > 0 && (
                        <div className="retest-measurements">
                          {followUpRuns.map(run=>(
                            <div key={run.id}><small>{run.variant.replaceAll('_', ' ').toUpperCase()}</small>
                              <strong>{formatNumber(run.metrics.latencyMs.p95)} ms</strong>
                              <span>{run.metrics.requestCount} measured requests</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {followUpRuns.length === 2 && (
                        <button type="button" className="button outline-button" disabled={Boolean(busy) || !aiConfigured}
                          onClick={() => void reviewHypothesis()}>
                          {busy==='reassessing'?<span className="spinner"/>:<SymbolIcon kind="spark"/>}
                          {busy==='reassessing'?'Checking new measurements…':'Ask Muse to reassess (uses credits)'}
                        </button>
                      )}
                    </div>
                  )}
                  {hypothesisReview && (
                    <div className="hypothesis-review">
                      <span className="overline">EVIDENCE-GATED RETEST VERDICT</span>
                      <h4>{hypothesisReview.assessment.verdict.replaceAll('_',' ')}</h4>
                      <p>{hypothesisReview.assessment.explanation}</p>
                      <div className="evidence-list">{hypothesisReview.citedEvidence.map(item=>(
                        <div className="evidence-row" key={item.id}><span>{item.id.replaceAll('_',' ').replaceAll('.',' · ')}</span>
                          <strong>{formatNumber(item.value)}</strong></div>
                      ))}</div>
                      <p><strong>Next analytical step:</strong> {hypothesisReview.assessment.nextStep}</p>
                      <p className="muted-note">{hypothesisReview.limitations.join(' ')}</p>
                    </div>
                  )}
                </div>
                <div className="repeat-export">
                  <div><span className="field-label">SOURCE-EVIDENCE SHA-256 CHECKSUM</span><code>{controlledReport.integrity.digest}</code></div>
                  <button type="button" className="button primary" onClick={exportControlledEvidence}>Export controlled evidence</button>
                </div>
                <p className="muted-note">{controlledReport.conclusion.limitations.join(' ')}</p>
                <p className="muted-note">This report is generated by deterministic evidence checks. Muse Spark has not interpreted the isolated contrasts yet—that is the next milestone.</p>
              </div>
            ) : (
              <p className="muted-note">Three separate local tests, one explicit action, no model credits. Contrasts: serialized 80 ms vs parallel 80 ms (only scheduling changes), then parallel 80 ms vs parallel 8 ms (only simulated work duration changes). A single ordered triplet is not proof of production causality.</p>
            )}
          </section>

          <section className="panel repeats-panel" id="repeatability">
            <div className="history-top">
              <div>
                <div className="overline"><SymbolIcon kind="shield"/> REPRODUCIBILITY CHECK</div>
                <h3>Does the improvement repeat?</h3>
                <p>Confirm the first comparison with two more matched pairs. No AI calls or credits are used.</p>
              </div>
              <button type="button" className="button outline-button"
                disabled={!connected || !comparison || trialPairs.length >= 3 || Boolean(busy)}
                onClick={() => void confirmTrials()}>
                {busy==='confirming' ? <span className="spinner"/> : <SymbolIcon kind="refresh"/>}
                {busy==='confirming' ? 'Running confirmation trials…' :
                  trialPairs.length >= 3 ? 'Three pairs collected' : 'Run confirmation trials'}
              </button>
            </div>
            <div className="repeat-progress">
              {[1,2,3].map((pairNo) => (
                <div className={'repeat-step ' + (trialPairs.length >= pairNo ? 'repeat-done' : '')} key={pairNo}>
                  <span className="repeat-number">{trialPairs.length >= pairNo ? '✓' : pairNo}</span>
                  <div><strong>Pair {pairNo}</strong><small>{trialPairs.length >= pairNo ? 'Complete' :
                    busy==='confirming' && confirmationProgress + 1 === pairNo ? 'Running…' : 'Awaiting trial'}</small></div>
                </div>
              ))}
            </div>
            {trialReport ? (
              <div className="report-body">
                <div className="repeat-summary">
                  <div><span className="overline">DETERMINISTIC ASSESSMENT</span>
                    <h4>{trialReport.manifest.summary.verdict.replaceAll('_',' ')}</h4>
                    <p>{trialReport.manifest.summary.improvedPairCount} of {trialReport.manifest.summary.pairCount} pairs meet the demonstration threshold (≥10 ms and ≥20% p95 reduction without higher error rate).</p>
                  </div>
                  <div className="repeat-median"><small>MEDIAN P95 REDUCTION</small><strong>{trialReport.manifest.summary.medianP95ReductionPercent == null ? '—' : formatNumber(trialReport.manifest.summary.medianP95ReductionPercent) + '%'}</strong></div>
                </div>
                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead><tr><th>PAIR</th><th>SLOW P95</th><th>OPTIMIZED P95</th><th>REDUCTION</th><th>THRESHOLD</th></tr></thead>
                    <tbody>{trialReport.manifest.observations.map((trial) => (
                      <tr key={trial.pairNumber}><td>#{trial.pairNumber}</td><td>{formatNumber(trial.beforeP95Ms)} ms</td>
                        <td>{formatNumber(trial.afterP95Ms)} ms</td>
                        <td>{trial.reductionPercent == null ? '—' : formatNumber(trial.reductionPercent) + '%'}</td>
                        <td>{trial.meetsDemoThreshold ? 'Meets' : 'Not met'}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="repeat-export">
                  <div><span className="field-label">EVIDENCE SHA-256 CHECKSUM</span><code>{trialReport.integrity.digest}</code></div>
                  <button type="button" className="button primary" onClick={exportEvidence}><SymbolIcon kind="arrow"/> Export evidence JSON</button>
                </div>
                <p className="muted-note">{trialReport.manifest.summary.limitations.join(' ')}</p>
              </div>
            ) : (
              <p className="muted-note">Requires three distinct slow/optimized pairs with the same parameters. Each pair runs two bounded experiments. No statistical significance or root cause is claimed. The exported checksum is not a digital signature.</p>
            )}
          </section>

          <section className="panel history-panel" id="history">
            <div className="history-top"><div><div className="overline"><SymbolIcon kind="grid"/> EXPERIMENT HISTORY</div><h3>Recent runs</h3><p>Ephemeral: the last 12 runs held by the Fastify process.</p></div><button type="button" className="button refresh-button" disabled={!connected || Boolean(busy)} onClick={()=>void refreshHistory(accessKey).catch(e=>setError(e instanceof Error?e.message:'Refresh failed'))}><SymbolIcon kind="refresh"/> Refresh</button></div>
            {history.length ? (
              <div className="history-table-wrapper"><table className="history-table"><thead><tr><th>RUN</th><th>VARIANT</th><th>DATE (LOCAL)</th><th>P95</th><th>THROUGHPUT</th><th>STATUS</th></tr></thead><tbody>{history.slice(0,8).map((run)=><tr key={run.id}><td className="mono-id">{compactId(run.id)}</td><td><span className={'variant-dot '+run.variant}/>{run.variant}</td><td>{new Date(run.recordedAt).toLocaleString()}</td><td>{formatNumber(run.metrics.latencyMs.p95)} ms</td><td>{formatNumber(run.metrics.observedRps)} req/s</td><td><span className={'history-status '+(run.status==='completed'?'':'cancelled')}>{run.status}</span></td></tr>)}</tbody></table></div>
            ) : <div className="history-empty">No runs recorded in this server process yet.</div>}
          </section>


          <section className="limitations-summary" aria-label="Known limitations">
            <div><span className="overline">WHAT THE DEMO DOES NOT CLAIM</span><h2>Limits, shown plainly.</h2></div>
            <p><strong>Local-only:</strong> the HTTP target is a fixed loopback GET endpoint, not production or third-party infrastructure. <strong>Bounded traffic:</strong> strict rate, worker and duration caps. <strong>Evidence is not proof:</strong> a before/after difference and Muse&apos;s hypotheses cannot establish root cause or statistical significance. Results are temporary unless exported.</p>
          </section>
          <footer className="footer"><span>LOADPILOT AI · BUILT FOR THE META GLOBAL AI DEVELOPER HACKATHON 2026</span><span><SymbolIcon kind="shield"/> Authorized local experiments only · Not production load testing</span></footer>
        </main>
      </div>
    </div>
  );
}
