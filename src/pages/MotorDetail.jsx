import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowLeft, Download, Gauge, TriangleAlert, Zap } from 'lucide-react';
import { MOTOR_BY_ID, RANGES, SECTION_BY_ID } from '../config/motors.js';
import { useLiveData } from '../context/LiveDataContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { getMotorHistory } from '../services/api.js';
import { Card, CommBadge, Empty, ErrorBanner, PageHeader, Segmented, StatCard, StatusBadge } from '../components/ui.jsx';
import { COLORS, ChartCard, axisProps, gridProps, timeAxis, timeTooltip, tooltipProps } from '../components/charts.jsx';
import { NA, fmtAgeSeconds, fmtDateTime, fmtDuration, fmtNum, fmtUnit } from '../utils/format.js';
import { buildParameterRows } from '../utils/params.js';
import { energyDeltas, prepareReadings } from '../utils/series.js';
import { parseTime } from '../utils/status.js';
import { READING_COLUMNS, downloadCsv, toCsv } from '../utils/csv.js';
import NotFound from './NotFound.jsx';

export default function MotorDetail() {
  const { motorId } = useParams();
  const cfg = MOTOR_BY_ID[motorId];
  if (!cfg) return <NotFound />;
  return <MotorDetailInner key={motorId} cfg={cfg} />;
}

function LineTrend({ title, subtitle, rows, dataKey, unit, color, spanMs, loading, empty, decimals = 2, domain, refLine, note }) {
  return (
    <ChartCard title={title} subtitle={subtitle} loading={loading} empty={empty} note={note} height={230}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis {...timeAxis(spanMs)} />
        <YAxis {...axisProps} width={48} domain={domain || ['auto', 'auto']} tickFormatter={(v) => fmtNum(v, decimals === 3 ? 2 : decimals > 1 ? 1 : 0)} />
        <Tooltip {...tooltipProps} {...timeTooltip} formatter={(v) => [v == null ? NA : fmtUnit(v, decimals, unit), title]} />
        {refLine != null && <ReferenceLine y={refLine.value} stroke={COLORS.threshold} strokeDasharray="4 4" label={{ value: refLine.label, fontSize: 11, fill: COLORS.threshold, position: 'insideBottomRight' }} />}
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ChartCard>
  );
}

function MotorDetailInner({ cfg }) {
  const { loaded, motorById, thresholds } = useLiveData();
  const [range, setRange] = useState('24h');
  const d = motorById[cfg.id];
  const spanMs = RANGES.find((r) => r.id === range).ms;
  const section = SECTION_BY_ID[cfg.sectionId];

  const history = useApi((signal) => getMotorHistory(cfg.id, range, signal), [cfg.id, range], { refreshMs: 30_000 });
  const rows = useMemo(() => prepareReadings(history.data?.readings, thresholds), [history.data, thresholds]);
  const energy = useMemo(() => energyDeltas(rows), [rows]);
  const hasData = (key) => rows.some((r) => r[key] != null);

  const daily = useMemo(
    () => (history.data?.daily || []).map((x) => ({ date: x.date, label: String(x.date).slice(5), energyKwh: x.energyKwh ?? null, runtimeMinutes: x.runtimeMinutes ?? null })),
    [history.data],
  );
  const monthly = history.data?.monthly || [];
  const events = useMemo(
    () => (history.data?.events || []).map((e) => ({ ...e, t: parseTime(e.ts) })).filter((e) => e.t != null).sort((a, b) => b.t - a.t).slice(0, 50),
    [history.data],
  );

  const exportRows = () => {
    const out = rows.map((r) => ({ ...r, motorId: cfg.id, motorName: cfg.name }));
    downloadCsv(`${cfg.id}-readings-${range}.csv`, toCsv(READING_COLUMNS, out));
  };

  if (!loaded || !d) {
    return (
      <>
        <BackLink />
        <PageHeader title={`${cfg.id} · ${cfg.name}`} subtitle="Waiting for live data…" />
      </>
    );
  }

  const groups = buildParameterRows(d).reduce((acc, p) => {
    (acc[p.group] ||= []).push(p);
    return acc;
  }, {});

  return (
    <>
      <BackLink />
      <PageHeader
        title={`${d.motorId} · ${d.name}`}
        subtitle={`Section ${section?.order}: ${section?.name}`}
        actions={
          <>
            <StatusBadge status={d.status} />
            <CommBadge comm={d.comm} />
          </>
        }
      />

      {!d.comm.ok && (
        <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" /> {d.comm.label}: operating status is UNKNOWN
          </div>
          <p className="mt-1">
            {d.comm.message}. The motor is <strong>not</strong> assumed to be stopped. Live values below show N/A until communication is restored.
          </p>
          {d.lastReadingAt != null && (
            <p className="mt-1 text-xs">
              Last successful reading {fmtDateTime(d.lastReadingAt)} ({fmtAgeSeconds(d.ageSeconds)} ago): {fmtUnit(d.lastKnown.avgCurrentA, 2, 'A')}, {fmtUnit(d.lastKnown.activePowerKw, 2, 'kW')}, PF {fmtNum(d.lastKnown.powerFactor, 3)}.
            </p>
          )}
        </div>
      )}
      {d.issues.length > 0 && (
        <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <div className="font-semibold">Unexpected meter data (affected values are shown as N/A and excluded from totals)</div>
          <ul className="mt-1 list-disc pl-5 text-xs">{d.issues.map((i) => <li key={i.field + i.message}>{i.message}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Average current" value={fmtNum(d.m.avgCurrentA, 2)} unit="A" icon={Activity} />
        <StatCard label="Active power" value={fmtNum(d.m.activePowerKw, 2)} unit="kW" icon={Zap} />
        <StatCard label="Power factor" value={fmtNum(d.m.powerFactor, 3)} icon={Gauge} />
        <StatCard label="Apparent power" value={fmtNum(d.m.apparentPowerKva, 2)} unit="kVA" icon={Zap} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {Object.entries(groups).map(([group, items]) => (
            <Card key={group} title={group} bodyClassName="p-0">
              <dl className="divide-y divide-slate-100">
                {items.map((p) => (
                  <div key={p.n} className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
                    <dt className="text-slate-500"><span className="num mr-2 text-xs text-slate-400">{p.n}.</span>{p.label}</dt>
                    <dd className={`num text-right font-medium ${p.text === NA ? 'text-slate-400' : p.text === 'Not running' ? 'text-slate-500' : 'text-slate-900'}`}>{p.text}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>

        <Card title="Meter & communication" bodyClassName="p-0" className="self-start">
          <dl className="divide-y divide-slate-100 text-sm">
            <Row k="Communication health"><CommBadge comm={d.comm} size="sm" /></Row>
            <Row k="Meter slave ID">{d.slaveId ?? NA}</Row>
            <Row k="Meter model">{d.meterModel ?? NA}</Row>
            <Row k="Gateway">{d.gatewayName ?? NA}{d.gatewayId && d.gatewayName !== d.gatewayId ? ` (${d.gatewayId})` : ''}</Row>
            <Row k="Last successful reading">{fmtDateTime(d.lastReadingAt)}</Row>
            <Row k="Reading age">{d.ageSeconds != null ? fmtAgeSeconds(d.ageSeconds) : NA}</Row>
            <Row k="Status detail">{d.comm.message}</Row>
          </dl>
        </Card>
      </div>

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-800">History</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Time range" value={range} onChange={setRange} options={RANGES.map((r) => ({ id: r.id, label: r.label }))} />
          <button type="button" className="btn" onClick={exportRows} disabled={!rows.length}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
          </button>
        </div>
      </div>
      {history.error && <div className="mb-3"><ErrorBanner message={`Could not load history: ${history.error}`} onRetry={history.reload} /></div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LineTrend title="Active power" subtitle="kW" rows={rows} dataKey="activePowerKw" unit="kW" color={COLORS.power} spanMs={spanMs} loading={history.loading} empty={!history.loading && !hasData('activePowerKw')} />
        <LineTrend title="Average current" subtitle="A" rows={rows} dataKey="avgCurrentA" unit="A" color={COLORS.current} spanMs={spanMs} loading={history.loading} empty={!history.loading && !hasData('avgCurrentA')} />
        <LineTrend
          title="Power factor" subtitle="Plotted only while the motor is running" rows={rows} dataKey="pfWhileRunning" unit="" color={COLORS.pf} spanMs={spanMs}
          loading={history.loading} empty={!history.loading && !hasData('pfWhileRunning')} decimals={3} domain={[0, 1]}
          refLine={{ value: thresholds.lowPowerFactor, label: `Low PF limit ${thresholds.lowPowerFactor}` }}
        />
        <ChartCard title="Energy consumption over time" subtitle="kWh used between readings (from the cumulative energy register)" loading={history.loading} empty={!history.loading && !energy.some((e) => e.kwh != null)} height={230}>
          <BarChart data={energy} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="t" tickFormatter={(v) => new Date(v).toLocaleString('en-GB', spanMs <= 2 * 86400000 ? { hour: '2-digit', minute: '2-digit', hour12: false } : { day: '2-digit', month: 'short' })} minTickGap={40} {...axisProps} />
            <YAxis {...axisProps} width={48} tickFormatter={(v) => fmtNum(v, 2)} />
            <Tooltip {...tooltipProps} {...timeTooltip} formatter={(v) => [v == null ? NA : fmtUnit(v, 3, 'kWh'), 'Energy']} />
            <Bar dataKey="kwh" fill={COLORS.energy} isAnimationActive={false} />
          </BarChart>
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Daily energy" subtitle="Last 30 days, kWh per day" loading={history.loading} empty={!history.loading && !daily.some((x) => x.energyKwh != null)} height={230}>
          <BarChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" minTickGap={24} {...axisProps} />
            <YAxis {...axisProps} width={48} />
            <Tooltip {...tooltipProps} formatter={(v) => [v == null ? NA : fmtUnit(v, 1, 'kWh'), 'Energy']} />
            <Bar dataKey="energyKwh" fill={COLORS.bar} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <Card title="Monthly energy summary" subtitle="Months are only as complete as the stored history" bodyClassName="p-0">
          {monthly.length === 0 ? (
            <Empty title={history.loading ? 'Loading…' : 'No monthly data'} />
          ) : (
            <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr><th className="th">Month</th><th className="th text-right">Energy (kWh)</th><th className="th text-right">Runtime</th><th className="th text-right">Days covered</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <td className="td">{m.month}</td>
                    <td className="td num text-right">{fmtNum(m.energyKwh ?? null, 1)}</td>
                    <td className="td num text-right">{fmtDuration(m.runtimeMinutes ?? null)}</td>
                    <td className="td num text-right">{m.daysCovered ?? NA}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Motor ON / OFF event history" subtitle="Most recent 50 events from the last 30 days" className="mt-4" bodyClassName="p-0">
        {events.length === 0 ? (
          <Empty title={history.loading ? 'Loading…' : 'No events recorded'} />
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="sticky top-0 bg-slate-50">
                <tr><th className="th">Time</th><th className="th">State</th><th className="th">Detail</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e, i) => (
                  <tr key={`${e.ts}-${i}`}>
                    <td className="td">{fmtDateTime(e.t)}</td>
                    <td className="td"><StatusBadge status={String(e.state || 'UNKNOWN').toUpperCase()} size="sm" /></td>
                    <td className="td whitespace-normal text-slate-500">{e.message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function BackLink() {
  return (
    <Link to="/motors" className="mb-2 inline-flex items-center gap-1 text-sm text-sky-700 hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All motors
    </Link>
  );
}

function Row({ k, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2">
      <dt className="shrink-0 text-slate-500">{k}</dt>
      <dd className="num text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}
