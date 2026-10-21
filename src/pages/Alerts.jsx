import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, Server, WifiOff } from 'lucide-react';
import { MOTORS, MOTOR_BY_ID } from '../config/motors.js';
import { useLiveData } from '../context/LiveDataContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { getAlertEvents } from '../services/api.js';
import { Card, CommBadge, Empty, ErrorBanner, PageHeader, Segmented, SeverityBadge, Spinner } from '../components/ui.jsx';
import { ALERT_TYPES, alertCategory, alertLabel, sortAlerts } from '../utils/alerts.js';
import { DEFAULT_THRESHOLDS, parseTime } from '../utils/status.js';
import { NA, fmtAgeSeconds, fmtDateTime } from '../utils/format.js';

const HISTORY_RANGES = [
  { id: '24h', label: '24 hours', ms: 86_400_000 },
  { id: '7d', label: '7 days', ms: 7 * 86_400_000 },
  { id: '30d', label: '30 days', ms: 30 * 86_400_000 },
];

export default function Alerts() {
  const { loaded, conn, alerts, motors, gateways, thresholds } = useLiveData();
  const [tab, setTab] = useState('active');
  const [severity, setSeverity] = useState('all');
  const [type, setType] = useState('all');
  const [motor, setMotor] = useState('all');
  const [histRange, setHistRange] = useState('24h');

  const history = useApi(
    (signal) => {
      if (tab !== 'history') return Promise.resolve(null);
      const now = Date.now();
      const ms = HISTORY_RANGES.find((r) => r.id === histRange).ms;
      return getAlertEvents(new Date(now - ms).toISOString(), new Date(now).toISOString(), signal);
    },
    [histRange, tab],
    { refreshMs: tab === 'history' ? 30_000 : undefined },
  );

  const historyRows = useMemo(
    () =>
      (history.data?.events || [])
        .map((e) => ({
          key: String(e.id ?? `${e.timestamp}-${e.motorId}-${e.type}`),
          timestamp: parseTime(e.timestamp),
          motorId: e.motorId,
          machineName: MOTOR_BY_ID[e.motorId]?.name ?? e.machineName ?? NA,
          type: e.type,
          severity: e.severity || ALERT_TYPES[e.type]?.severity || 'info',
          description: e.description || '',
        }))
        .filter((e) => e.timestamp != null)
        .sort((a, b) => b.timestamp - a.timestamp),
    [history.data],
  );

  const source = tab === 'active' ? sortAlerts(alerts) : historyRows;
  const types = [...new Set(source.map((a) => a.type))];
  const shown = source.filter(
    (a) => (severity === 'all' || a.severity === severity) && (type === 'all' || a.type === type) && (motor === 'all' || a.motorId === motor),
  );

  const commProblems = motors.filter((d) => !d.comm.ok);

  if (!loaded) {
    return (
      <>
        <PageHeader title="Alerts & Communication" />
        {conn.api === 'error' ? <ErrorBanner message={`${conn.error}. No live data has been received yet.`} /> : <Spinner label="Waiting for live data…" />}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Alerts & Communication" subtitle="Communication health is tracked separately from motor operating status." />

      <Card title="Communication health" subtitle="Gateways and meters. A communication problem makes motor status UNKNOWN, never STOPPED." className="mb-4" bodyClassName="p-0">
        <div className="grid gap-px bg-slate-100 md:grid-cols-2">
          <div className="bg-white p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Gateways</h3>
            {gateways.length === 0 ? (
              <p className="text-sm text-slate-500">No gateway information received.</p>
            ) : (
              <ul className="space-y-2">
                {gateways.map((g) => (
                  <li key={g.id} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${g.online ? 'border-slate-200' : 'border-amber-300 bg-amber-50'}`}>
                    <Server className={`mt-0.5 h-4 w-4 ${g.online ? 'text-green-700' : 'text-amber-700'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">{g.name}</span>
                        <span className={`text-xs font-semibold ${g.online ? 'text-green-700' : 'text-amber-800'}`}>{g.online ? 'ONLINE' : `OFFLINE (${g.reason})`}</span>
                      </div>
                      <div className="text-xs text-slate-500">Last heartbeat {fmtDateTime(g.lastSeenAt)} · {g.motorIds.length} meters ({g.motorIds.join(', ') || NA})</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Meters with communication problems</h3>
            {commProblems.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-green-700"><CircleCheck className="h-4 w-4" aria-hidden="true" /> All {motors.length} meters are responding.</p>
            ) : (
              <ul className="space-y-2">
                {commProblems.map((d) => (
                  <li key={d.motorId} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link to={`/motors/${d.motorId}`} className="font-semibold text-slate-800 hover:underline">{d.motorId} · {d.name}</Link>
                      <CommBadge comm={d.comm} size="sm" />
                    </div>
                    <div className="mt-0.5 flex items-start gap-1 text-xs text-amber-900"><WifiOff className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{d.comm.message}</div>
                    <div className="text-xs text-slate-500">Last successful reading {fmtDateTime(d.lastReadingAt)}{d.ageSeconds != null ? ` (${fmtAgeSeconds(d.ageSeconds)} ago)` : ''}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          label="Alert view"
          value={tab}
          onChange={(t) => { setTab(t); setType('all'); }}
          options={[{ id: 'active', label: `Active now (${alerts.length})` }, { id: 'history', label: 'Event history' }]}
        />
        {tab === 'history' && <Segmented label="History range" value={histRange} onChange={setHistRange} options={HISTORY_RANGES.map(({ id, label }) => ({ id, label }))} />}
        <select className="input" aria-label="Filter by severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select className="input" aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {types.map((t) => <option key={t} value={t}>{alertLabel(t)}</option>)}
        </select>
        <select className="input" aria-label="Filter by motor" value={motor} onChange={(e) => setMotor(e.target.value)}>
          <option value="all">All motors</option>
          {MOTORS.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
        </select>
      </div>

      {tab === 'history' && history.error && <div className="mb-3"><ErrorBanner message={`Could not load event history: ${history.error}`} onRetry={history.reload} /></div>}

      <Card bodyClassName="p-0">
        {tab === 'history' && history.loading ? (
          <div className="p-6"><Spinner /></div>
        ) : shown.length === 0 ? (
          <Empty title={tab === 'active' ? 'No active alerts match these filters' : 'No events in this period'}>
            {tab === 'active' && alerts.length === 0 ? 'Everything is within the configured limits.' : undefined}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Severity</th><th className="th">Type</th><th className="th">Motor ID</th><th className="th">Machine</th>
                  <th className="th">{tab === 'active' ? 'Since' : 'Timestamp'}</th><th className="th">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((a) => (
                  <tr key={a.key} className="align-top">
                    <td className="td"><SeverityBadge severity={a.severity} /></td>
                    <td className="td"><div className="font-medium">{alertLabel(a.type)}</div><div className="text-xs text-slate-400">{alertCategory(a.type)}</div></td>
                    <td className="td font-semibold"><Link to={`/motors/${a.motorId}`} className="text-sky-800 hover:underline">{a.motorId}</Link></td>
                    <td className="td">{a.machineName}</td>
                    <td className="td">{fmtDateTime(a.timestamp)}</td>
                    <td className="td min-w-[18rem] whitespace-normal text-slate-600">{a.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {tab === 'active' && (
        <p className="mt-2 text-xs text-slate-500">“Since” is when this browser first saw the condition. Durable history is in the Event history tab.</p>
      )}

      <ThresholdSettings thresholds={thresholds} />
    </>
  );
}

const GLOBAL_FIELDS = [
  { key: 'highCurrentA', label: 'High current limit', unit: 'A', step: 1, min: 0 },
  { key: 'highPowerKw', label: 'High power limit', unit: 'kW', step: 0.5, min: 0 },
  { key: 'lowPowerFactor', label: 'Low power factor below', unit: '', step: 0.01, min: 0, max: 1 },
  { key: 'runCurrentA', label: 'Running if current ≥', unit: 'A', step: 0.1, min: 0 },
  { key: 'staleSeconds', label: 'Reading is stale after', unit: 's', step: 10, min: 10 },
];

function ThresholdSettings({ thresholds }) {
  const { setThresholds, resetThresholds } = useLiveData();
  const [draft, setDraft] = useState(() => toDraft(thresholds));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const change = (fn) => { setDraft(fn); setSaved(false); };

  function save() {
    const next = { ...thresholds, motorOverrides: {} };
    for (const f of GLOBAL_FIELDS) {
      const v = Number(draft[f.key]);
      if (draft[f.key] === '' || !Number.isFinite(v) || v < f.min || (f.max != null && v > f.max)) {
        return setError(`${f.label}: enter a number${f.max != null ? ` between ${f.min} and ${f.max}` : ` ≥ ${f.min}`}.`);
      }
      next[f.key] = v;
    }
    for (const m of MOTORS) {
      const o = draft.overrides[m.id] || {};
      const entry = {};
      for (const k of ['highCurrentA', 'highPowerKw']) {
        if (o[k] === '' || o[k] == null) continue;
        const v = Number(o[k]);
        if (!Number.isFinite(v) || v <= 0) return setError(`${m.id}: ${k === 'highCurrentA' ? 'high current' : 'high power'} override must be a positive number (or empty to use the default).`);
        entry[k] = v;
      }
      if (Object.keys(entry).length) next.motorOverrides[m.id] = entry;
    }
    setError('');
    setThresholds(next);
    setSaved(true);
  }

  function reset() {
    resetThresholds();
    setDraft(toDraft(DEFAULT_THRESHOLDS));
    setError('');
    setSaved(false);
  }

  return (
    <Card title="Alert thresholds" subtitle="Saved in this browser. Limits apply to running motors using valid readings only." className="mt-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {GLOBAL_FIELDS.map((f) => (
          <label key={f.key} className="text-xs font-medium text-slate-600">
            {f.label}{f.unit ? ` (${f.unit})` : ''}
            <input type="number" inputMode="decimal" className="input mt-0.5 block w-full" step={f.step} min={f.min} max={f.max} value={draft[f.key]} onChange={(e) => change((d) => ({ ...d, [f.key]: e.target.value }))} />
          </label>
        ))}
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Per-motor high-current / high-power limits (optional)</summary>
        <p className="mt-1 text-xs text-slate-500">Leave a field empty to use the default above. Set these to each motor’s rated values; one default cannot suit motors from 3.7 kW to 37 kW.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr><th className="th">Motor</th><th className="th">High current (A)</th><th className="th">High power (kW)</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {MOTORS.map((m) => (
                <tr key={m.id}>
                  <td className="td">{m.id} · {m.name}</td>
                  {['highCurrentA', 'highPowerKw'].map((k) => (
                    <td key={k} className="td">
                      <input
                        type="number" inputMode="decimal" min="0" step="0.5" className="input w-28"
                        aria-label={`${m.id} ${k === 'highCurrentA' ? 'high current' : 'high power'} override`}
                        placeholder={String(draft[k] || '')}
                        value={draft.overrides[m.id]?.[k] ?? ''}
                        onChange={(e) => change((d) => ({ ...d, overrides: { ...d.overrides, [m.id]: { ...d.overrides[m.id], [k]: e.target.value } } }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={save}>Save thresholds</button>
        <button type="button" className="btn" onClick={reset}>Reset to defaults</button>
        {saved && <span role="status" className="text-sm text-green-700">Saved. Alerts are re-evaluated immediately.</span>}
        {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
      </div>
    </Card>
  );
}

function toDraft(th) {
  return {
    highCurrentA: String(th.highCurrentA),
    highPowerKw: String(th.highPowerKw),
    lowPowerFactor: String(th.lowPowerFactor),
    runCurrentA: String(th.runCurrentA),
    staleSeconds: String(th.staleSeconds),
    overrides: Object.fromEntries(Object.entries(th.motorOverrides || {}).map(([id, o]) => [id, { highCurrentA: o.highCurrentA ?? '', highPowerKw: o.highPowerKw ?? '' }])),
  };
}
