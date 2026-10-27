'use client';

import { useCallback, useState, type ReactNode } from 'react';
import {
  compactId, defaultPlan, formatNumber,
  type Comparison, type DashboardAction, type ExperimentRun, type Finding, type TestPlan,
} from '../lib/contracts';

type Busy = 'connecting' | 'planning' | 'running-slow' | 'running-optimized' | 'comparing' | 'diagnosing' | null;

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

export default function HomePage() {
  const [accessKey, setAccessKey] = useState('');
  const [connected, setConnected] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
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

  const clearResults = () => {
    setBefore(null); setAfter(null); setComparison(null); setDiagnosis(null);
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

  const running = busy === 'running-slow' || busy === 'running-optimized' || busy === 'comparing';
  const progress = diagnosis ? 4 : comparison ? 3 : before ? 2 : planSource === 'muse' ? 1 : 0;
  const reduction = comparison?.p95ReductionPercent;
  const throughputPercent = before && after && before.metrics.observedRps > 0
    ? (after.metrics.observedRps / before.metrics.observedRps - 1) * 100 : null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><SymbolIcon kind="pulse"/></div><div><strong>loadpilot<span>.ai</span></strong><small>PERFORMANCE INTELLIGENCE</small></div></div>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Dashboard navigation">
          <a className="nav-active" href="#overview"><SymbolIcon kind="grid"/> Overview</a>
          <a href="#experiments"><SymbolIcon kind="pulse"/> Experiments</a>
          <a href="#analysis"><SymbolIcon kind="spark"/> AI Investigator</a>
          <a href="#history"><SymbolIcon kind="chart"/> Run History</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-info"><span className="sidebar-info-icon"><SymbolIcon kind="shield"/></span><strong>Controlled by design</strong><p>Isolated demo target · bounded execution · no arbitrary URLs</p></div>
          <p className="sidebar-credit">META GLOBAL AI HACKATHON · 2026<br/>Indie Developer Track</p>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="breadcrumbs">Workspace <span>/</span> <strong>Overview</strong></div>
          <div className="topbar-right"><span className={'connection-dot ' + (connected ? 'online' : '')}/><span>{connected ? 'API CONNECTED' : 'NOT CONNECTED'}</span><span className="topbar-divider"/><span className="user-avatar">LP</span></div>
        </header>

        <main id="overview" className="dashboard">
          <div className="headline">
            <div><p className="eyebrow">AI-POWERED PERFORMANCE ENGINEERING <span className="eyebrow-line"/></p><h1>Understand your<br/><span>system under pressure.</span></h1><p className="headline-desc">Plan safe experiments, measure what matters, and let AI turn real performance evidence into actionable hypotheses.</p></div>
            <div className="model-pill"><span className="model-spark">✦</span><div><strong>Muse Spark 1.3</strong><small>META MODEL API</small></div><span className={'pill-dot ' + (aiConfigured ? 'online' : '')}/></div>
          </div>

          {!connected && (
            <section className="connect-panel" aria-label="Connect to private LoadPilot API">
              <div className="connect-icon"><SymbolIcon kind="lock"/></div>
              <div className="connect-copy"><strong>Unlock your private workspace</strong><p>Enter the dashboard access key configured on the Next.js server. The key stays in this tab&apos;s memory and is not saved in browser storage.</p></div>
              <div className="connect-actions"><input type="password" aria-label="Dashboard access key" autoComplete="off" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} placeholder="Dashboard access key" onKeyDown={(event) => { if (event.key === 'Enter' && !busy) void connect(); }}/><button type="button" className="button primary" onClick={() => void connect()} disabled={Boolean(busy) || !accessKey}>Connect <SymbolIcon kind="arrow"/></button></div>
            </section>
          )}
          {connected && (
            <div className="connected-banner"><span><span className="tiny-success"/> Private API verified · <strong>demo-api</strong> allowlisted · {aiConfigured ? 'Meta AI ready' : 'Meta AI not configured'}</span><button className="text-button" onClick={() => { setConnected(false); setAiConfigured(false); setAccessKey(''); clearResults(); setHistory([]); }} type="button" disabled={Boolean(busy)}>Lock workspace</button></div>
          )}

          {error && <div className="alert" role="alert"><strong>Action needs attention</strong><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
          <div className="notice"><span className="live-ring"/><span role="status">{notice}</span></div>

          <div className="section-top"><div><p className="section-kicker">THE INVESTIGATION</p><h2>One workflow. Full visibility.</h2></div><span className="mode-chip"><SymbolIcon kind="shield"/> LOCAL DEMO MODE</span></div>

          <div className="stepper" aria-label="Workflow progress">
            {[{name:'Plan',sub:'Define a safe test'}, {name:'Execute',sub:'Collect real metrics'}, {name:'Compare',sub:'Measure the difference'}, {name:'Diagnose',sub:'Evidence-based insights'}].map((step,i)=><div className={'step '+(progress>i?'step-complete':(progress===i?'step-current':''))} key={step.name}><span className="step-number">{progress>i?'✓':String(i+1).padStart(2,'0')}</span><span><strong>{step.name}</strong><small>{step.sub}</small></span></div>)}
          </div>

          <div className="main-grid" id="experiments">
            <section className="panel experiment-panel">
              <div className="panel-header"><div><div className="overline"><SymbolIcon kind="cpu"/> EXPERIMENT CONTROL</div><h3>Design your test</h3><p>Only the bundled, isolated demonstration API can be tested.</p></div><span className="status-chip">TARGET LOCKED</span></div>
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
              <div className="panel-header"><div><div className="overline"><SymbolIcon kind="chart"/> LIVE RESULTS</div><h3>Performance comparison</h3><p>Computed directly from completed local test runs.</p></div><span className={'result-state '+(comparison?'result-ready':'')}>{comparison?'MEASURED':'AWAITING DATA'}</span></div>
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
                <div className="empty-results"><div className="empty-icon"><SymbolIcon kind="pulse"/></div><h4>No measurements yet</h4><p>Run the slow and optimized demo variants to unlock real latency charts, throughput comparison and AI diagnostics.</p><div className="empty-pills"><span>p50 · p95 · p99</span><span>REQUEST RATE</span><span>ERRORS</span></div></div>
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

          <section className="panel history-panel" id="history">
            <div className="history-top"><div><div className="overline"><SymbolIcon kind="grid"/> EXPERIMENT HISTORY</div><h3>Recent runs</h3><p>Ephemeral: the last 12 runs held by the Fastify process.</p></div><button type="button" className="button refresh-button" disabled={!connected || Boolean(busy)} onClick={()=>void refreshHistory(accessKey).catch(e=>setError(e instanceof Error?e.message:'Refresh failed'))}><SymbolIcon kind="refresh"/> Refresh</button></div>
            {history.length ? (
              <div className="history-table-wrapper"><table className="history-table"><thead><tr><th>RUN</th><th>VARIANT</th><th>DATE (LOCAL)</th><th>P95</th><th>THROUGHPUT</th><th>STATUS</th></tr></thead><tbody>{history.slice(0,8).map((run)=><tr key={run.id}><td className="mono-id">{compactId(run.id)}</td><td><span className={'variant-dot '+run.variant}/>{run.variant}</td><td>{new Date(run.recordedAt).toLocaleString()}</td><td>{formatNumber(run.metrics.latencyMs.p95)} ms</td><td>{formatNumber(run.metrics.observedRps)} req/s</td><td><span className={'history-status '+(run.status==='completed'?'':'cancelled')}>{run.status}</span></td></tr>)}</tbody></table></div>
            ) : <div className="history-empty">No runs recorded in this server process yet.</div>}
          </section>

          <footer className="footer"><span>LOADPILOT AI · BUILT FOR THE META GLOBAL AI DEVELOPER HACKATHON 2026</span><span><SymbolIcon kind="shield"/> Authorized local experiments only · Not production load testing</span></footer>
        </main>
      </div>
    </div>
  );
}
