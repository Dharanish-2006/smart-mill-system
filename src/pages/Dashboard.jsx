import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Clock, Cog, Gauge, OctagonX, Play, WifiOff, Zap } from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { getReport } from '../services/api.js';
import { Card, CommBadge, ErrorBanner, PageHeader, SeverityBadge, Spinner, StatCard, StatusBadge } from '../components/ui.jsx';
import { COLORS, ChartCard, axisProps, gridProps, timeAxis, tooltipProps } from '../components/charts.jsx';
import { NA, fmtAgeSeconds, fmtDuration, fmtNum, fmtTooltipTime, fmtUnit } from '../utils/format.js';
import { parseTime } from '../utils/status.js';
import { alertLabel } from '../utils/alerts.js';

const DAY = 86_400_000;

function included(s, noun = 'meters') {
  return `${s.included} of ${s.of} ${noun} included`;
}

function CardLink({ to, children }) {
  return (
    <Link to={to} className="block rounded-lg hover:ring-1 hover:ring-slate-300">
      {children}
    </Link>
  );
}

export default function Dashboard() {
  const { loaded, conn, motors, summary: s, alerts } = useLiveData();

  const report = useApi(
    (signal) => {
      const now = Date.now();
      return getReport(new Date(now - DAY).toISOString(), new Date(now).toISOString(), signal);
    },
    [],
    { refreshMs: 60_000 },
  );

  const series = useMemo(
    () =>
      (report.data?.totalPowerSeries || [])
        .map((p) => ({ t: parseTime(p.ts), totalKw: Number.isFinite(Number(p.totalKw)) && p.totalKw !== null ? Number(p.totalKw) : null, meters: p.meters ?? null }))
        .filter((p) => p.t != null),
    [report.data],
  );

  if (!loaded) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Plant-wide overview" />
        {conn.api === 'error' ? <ErrorBanner message={`${conn.error}. No live data has been received yet.`} /> : <Spinner label="Waiting for live data…" />}
      </>
    );
  }

  const critical = alerts.filter((a) => a.severity === 'critical').length;
  const runningPct = s.totalMotors ? Math.round((s.running / s.totalMotors) * 100) : 0;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Plant-wide overview of all 15 motors. Totals use valid readings only." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardLink to="/motors">
          <StatCard label="Total motors" value={String(s.totalMotors)} icon={Cog} sub="M1 – M15, 11 sections" />
        </CardLink>
        <CardLink to="/motors?filter=running">
          <StatCard label="Running motors" value={String(s.running)} icon={Play} tone="good" sub={`${runningPct}% of motors`} />
        </CardLink>
        <CardLink to="/motors?filter=stopped">
          <StatCard label="Stopped motors" value={String(s.stopped)} icon={OctagonX} tone={s.stopped ? 'bad' : 'neutral'} sub="Confirmed stopped (comms OK)" />
        </CardLink>
        <CardLink to="/motors?filter=comm">
          <StatCard
            label="Communication errors"
            value={String(s.commErrors)}
            icon={WifiOff}
            tone={s.commErrors ? 'warn' : 'good'}
            sub={s.unknown ? `${s.unknown} motor${s.unknown > 1 ? 's' : ''} with UNKNOWN status` : 'All meters responding'}
          />
        </CardLink>
        <StatCard label="Total active power" value={fmtNum(s.power.value, 2)} unit="kW" icon={Zap} sub={included(s.power)} />
        <StatCard label="Total energy" value={fmtNum(s.energy.value, 0)} unit="kWh" icon={Activity} sub={included(s.energy)} />
        <StatCard label="Average power factor" value={fmtNum(s.pf.value, 3)} icon={Gauge} sub={s.pf.included ? `Mean of ${s.pf.included} running meter${s.pf.included > 1 ? 's' : ''}` : 'No running meters with valid data'} />
        <StatCard label="Total runtime" value={fmtDuration(s.runtime.value)} icon={Clock} sub={included(s.runtime)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <ChartCard
            title="Total active power – last 24 hours"
            subtitle="Sum of valid meter readings. Hover for the number of meters included at each point."
            loading={report.loading}
            empty={!report.loading && series.every((p) => p.totalKw == null)}
            emptyText={report.error ? `Could not load history: ${report.error}` : 'No history available yet'}
          >
            <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis {...timeAxis(DAY)} />
              <YAxis {...axisProps} width={44} unit=" kW" />
              <Tooltip
                {...tooltipProps}
                labelFormatter={(l, p) => `${fmtTooltipTime(l)}${p?.[0]?.payload?.meters != null ? ` · ${p[0].payload.meters}/15 meters` : ''}`}
                formatter={(v) => [fmtUnit(v, 2, 'kW'), 'Active power']}
              />
              <Area type="monotone" dataKey="totalKw" stroke={COLORS.power} fill={COLORS.power} fillOpacity={0.12} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            </AreaChart>
          </ChartCard>
        </div>

        <Card
          title="Active alerts"
          subtitle={alerts.length ? `${alerts.length} active${critical ? `, ${critical} critical` : ''}` : undefined}
          actions={<Link to="/alerts" className="text-sm text-sky-700 hover:underline">View all</Link>}
          bodyClassName="p-0"
        >
          {alerts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No active alerts</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.slice(0, 6).map((a) => (
                <li key={a.key} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link to={`/motors/${a.motorId}`} className="text-sm font-semibold text-slate-800 hover:underline">
                      {a.motorId} · {a.machineName}
                    </Link>
                    <SeverityBadge severity={a.severity} />
                  </div>
                  <div className="mt-0.5 text-xs font-medium text-slate-600">{alertLabel(a.type)}</div>
                  <div className="text-xs text-slate-500">{a.description}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Motor status" subtitle="Operating status and communication health are shown separately." className="mt-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {motors.map((d) => (
            <Link
              key={d.motorId}
              to={`/motors/${d.motorId}`}
              className={`rounded-md border p-2.5 hover:bg-slate-50 ${d.status === 'RUNNING' ? 'border-l-4 border-l-green-600' : d.status === 'STOPPED' ? 'border-l-4 border-l-red-600' : 'border-l-4 border-l-amber-500'} border-slate-200`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800">{d.motorId}</span>
                <StatusBadge status={d.status} size="sm" />
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-500" title={d.name}>{d.name}</div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="num text-sm font-medium text-slate-700">{fmtUnit(d.m.activePowerKw, 2, 'kW')}</span>
                {!d.comm.ok ? <CommBadge comm={d.comm} size="sm" /> : <span className="text-[11px] text-slate-400">{d.ageSeconds != null ? `${fmtAgeSeconds(d.ageSeconds)} ago` : NA}</span>}
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
