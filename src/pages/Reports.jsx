import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, RefreshCw } from 'lucide-react';
import { MOTORS, MOTOR_BY_ID, SECTIONS, motorsInSection } from '../config/motors.js';
import { useLiveData } from '../context/LiveDataContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { getReadings, getReport, describeError } from '../services/api.js';
import { Card, ErrorBanner, PageHeader, Segmented } from '../components/ui.jsx';
import { COLORS, ChartCard, axisProps, gridProps, timeAxis, tooltipProps } from '../components/charts.jsx';
import { NA, fmtNum, fmtTooltipTime, fmtUnit, parseDateInput, toDateInput } from '../utils/format.js';
import { parseTime, sanitizeMeasurements } from '../utils/status.js';
import { READING_COLUMNS, downloadCsv, toCsv } from '../utils/csv.js';

const DAY = 86_400_000;
const PRESETS = [
  { id: '24h', label: 'Last 24 hours', ms: DAY },
  { id: '7d', label: 'Last 7 days', ms: 7 * DAY },
  { id: '30d', label: 'Last 30 days', ms: 30 * DAY },
  { id: 'custom', label: 'Custom' },
];

const mkWindow = (ms) => {
  const to = Date.now();
  return { from: to - ms, to };
};
const clean = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

export default function Reports() {
  const { thresholds } = useLiveData();
  const [preset, setPreset] = useState('24h');
  const [win, setWin] = useState(() => mkWindow(DAY));
  const [custom, setCustom] = useState({ from: toDateInput(Date.now() - 7 * DAY), to: toDateInput(Date.now()) });
  const [customError, setCustomError] = useState('');
  const [exportMotor, setExportMotor] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);

  const choosePreset = (id) => {
    setPreset(id);
    setCustomError('');
    const p = PRESETS.find((x) => x.id === id);
    if (p.ms) setWin(mkWindow(p.ms));
  };

  const applyCustom = () => {
    const from = parseDateInput(custom.from);
    const to = parseDateInput(custom.to) + DAY; // include the whole end day
    if (!Number.isFinite(from) || !Number.isFinite(to)) return setCustomError('Choose both dates.');
    if (to <= from) return setCustomError('The end date must be on or after the start date.');
    if (to - from > 92 * DAY) return setCustomError('Please choose a range of 92 days or less.');
    setCustomError('');
    setWin({ from, to: Math.min(to, Date.now()) });
  };

  const refresh = () => {
    const p = PRESETS.find((x) => x.id === preset);
    if (p?.ms) setWin(mkWindow(p.ms));
    else applyCustom();
  };

  const report = useApi(
    (signal) => getReport(new Date(win.from).toISOString(), new Date(win.to).toISOString(), signal),
    [win.from, win.to],
  );
  const spanMs = win.to - win.from;
  const r = report.data;

  const power = useMemo(
    () => (r?.totalPowerSeries || []).map((p) => ({ t: parseTime(p.ts), totalKw: clean(p.totalKw), meters: p.meters ?? null })).filter((p) => p.t != null),
    [r],
  );

  const perMotor = useMemo(() => {
    const byId = new Map((r?.energyByMotor || []).map((x) => [x.motorId, x]));
    return MOTORS.map((m) => {
      const x = byId.get(m.id);
      return {
        motorId: m.id,
        name: m.name,
        sectionId: m.sectionId,
        kwh: clean(x?.energyKwh),
        hours: clean(x?.runtimeMinutes) != null ? clean(x.runtimeMinutes) / 60 : null,
        pf: (() => { const v = clean(x?.avgPowerFactor); return v != null && v >= -1 && v <= 1 ? Math.abs(v) : null; })(),
      };
    });
  }, [r]);

  const bySection = useMemo(
    () =>
      SECTIONS.map((s) => {
        const ms = motorsInSection(s.id).map((m) => perMotor.find((p) => p.motorId === m.id));
        const have = ms.filter((p) => p.kwh != null);
        return {
          id: `S${s.order}`,
          name: s.name,
          kwh: have.length ? have.reduce((a, p) => a + p.kwh, 0) : null,
          included: have.length,
          total: ms.length,
        };
      }),
    [perMotor],
  );

  const daily = useMemo(() => (r?.dailyEnergy || []).map((x) => ({ date: x.date, label: String(x.date).slice(5), kwh: clean(x.energyKwh) })), [r]);
  const hourly = useMemo(() => (r?.hourlyProfile || []).map((x) => ({ hour: x.hour, label: `${String(x.hour).padStart(2, '0')}:00`, kw: clean(x.avgKw) })), [r]);

  const missing = (key) => perMotor.filter((p) => p[key] == null).map((p) => p.motorId);
  const noteFor = (key) => {
    const m = missing(key);
    return m.length ? `No data for: ${m.join(', ')} (shown as gaps, not zero).` : undefined;
  };
  const noData = (arr, key) => !report.loading && !arr.some((x) => x[key] != null);
  const loadErr = report.error ? `Could not load report: ${report.error}` : 'No data for this period';

  async function exportReadings() {
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await getReadings(new Date(win.from).toISOString(), new Date(win.to).toISOString(), exportMotor);
      const rows = (res?.readings || []).map((row) => {
        const { m } = sanitizeMeasurements(row);
        return { ...m, t: parseTime(row.ts), motorId: row.motorId, motorName: MOTOR_BY_ID[row.motorId]?.name ?? row.motorName ?? null };
      }).filter((row) => row.t != null);
      if (!rows.length) {
        setExportMsg({ tone: 'warn', text: 'No readings found for this selection, nothing was exported.' });
      } else {
        downloadCsv(`readings-${exportMotor}-${stamp()}.csv`, toCsv(READING_COLUMNS, rows));
        setExportMsg({
          tone: res?.truncated ? 'warn' : 'ok',
          text: res?.truncated ? `Exported ${rows.length.toLocaleString('en-IN')} rows. The result was truncated by the server; choose a shorter range or one motor for a complete export.` : `Exported ${rows.length.toLocaleString('en-IN')} rows.`,
        });
      }
    } catch (e) {
      setExportMsg({ tone: 'warn', text: `Export failed: ${describeError(e)}` });
    } finally {
      setExporting(false);
    }
  }

  const exportSummary = () =>
    downloadCsv(`motor-summary-${stamp()}.csv`, toCsv(
      [
        { header: 'Motor ID', key: 'motorId' }, { header: 'Motor Name', key: 'name' },
        { header: 'Section', value: (p) => SECTIONS.find((s) => s.id === p.sectionId)?.name },
        { header: 'Energy (kWh)', key: 'kwh' }, { header: 'Running time (h)', key: 'hours' }, { header: 'Average power factor (running)', key: 'pf' },
      ],
      perMotor,
    ));
  const exportDaily = () => downloadCsv(`daily-energy-${stamp()}.csv`, toCsv([{ header: 'Date', key: 'date' }, { header: 'Energy (kWh)', key: 'kwh' }], daily));
  const exportPower = () =>
    downloadCsv(`total-power-${stamp()}.csv`, toCsv(
      [{ header: 'Timestamp (ISO)', value: (p) => new Date(p.t).toISOString() }, { header: 'Total active power (kW)', key: 'totalKw' }, { header: 'Meters included', key: 'meters' }],
      power,
    ));

  const barMargin = { top: 8, right: 12, left: 0, bottom: 0 };

  return (
    <>
      <PageHeader title="Charts & Reports" subtitle="Historical analysis from stored meter readings." actions={<button type="button" className="btn" onClick={refresh}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh</button>} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Segmented label="Date range" value={preset} onChange={choosePreset} options={PRESETS.map(({ id, label }) => ({ id, label }))} />
          {preset === 'custom' && (
            <>
              <label className="text-xs font-medium text-slate-600">From
                <input type="date" className="input mt-0.5 block" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              </label>
              <label className="text-xs font-medium text-slate-600">To
                <input type="date" className="input mt-0.5 block" value={custom.to} min={custom.from} max={toDateInput(Date.now())} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              </label>
              <button type="button" className="btn btn-primary" onClick={applyCustom}>Apply</button>
            </>
          )}
          <div className="text-xs text-slate-500">
            {new Date(win.from).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} → {new Date(win.to).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>
        {customError && <p role="alert" className="mt-2 text-sm text-red-700">{customError}</p>}
      </Card>

      {report.error && <div className="mb-4"><ErrorBanner message={`Could not load report: ${report.error}`} onRetry={report.reload} /></div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0 lg:col-span-2">
          <ChartCard title="Total active power over time" subtitle="Sum of valid meter readings; hover for meters included" loading={report.loading} empty={noData(power, 'totalKw')} emptyText={loadErr}>
            <AreaChart data={power} margin={barMargin}>
              <CartesianGrid {...gridProps} />
              <XAxis {...timeAxis(spanMs)} />
              <YAxis {...axisProps} width={52} unit=" kW" />
              <Tooltip {...tooltipProps} labelFormatter={(l, p) => `${fmtTooltipTime(l)}${p?.[0]?.payload?.meters != null ? ` · ${p[0].payload.meters}/15 meters` : ''}`} formatter={(v) => [fmtUnit(v, 2, 'kW'), 'Total active power']} />
              <Legend />
              <Area name="Total active power (kW)" type="monotone" dataKey="totalKw" stroke={COLORS.power} fill={COLORS.power} fillOpacity={0.12} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            </AreaChart>
          </ChartCard>
        </div>

        <ChartCard title="Energy consumption by motor" subtitle="kWh used in the selected period" loading={report.loading} empty={noData(perMotor, 'kwh')} emptyText={loadErr} note={noteFor('kwh')}>
          <BarChart data={perMotor} margin={barMargin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="motorId" interval={0} {...axisProps} fontSize={11} />
            <YAxis {...axisProps} width={52} />
            <Tooltip {...tooltipProps} labelFormatter={(id) => `${id} · ${MOTOR_BY_ID[id]?.name}`} formatter={(v) => [fmtUnit(v, 1, 'kWh'), 'Energy']} />
            <Legend />
            <Bar name="Energy (kWh)" dataKey="kwh" fill={COLORS.bar} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Energy consumption by process section" subtitle="kWh per section; sums motors that have data" loading={report.loading} empty={noData(bySection, 'kwh')} emptyText={loadErr} note={bySection.some((s) => s.included < s.total) ? 'Some sections include fewer motors than they contain; hover to see how many.' : undefined}>
          <BarChart data={bySection} margin={barMargin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="id" interval={0} {...axisProps} fontSize={11} />
            <YAxis {...axisProps} width={52} />
            <Tooltip {...tooltipProps} labelFormatter={(id) => bySection.find((s) => s.id === id)?.name} formatter={(v, n, item) => [`${fmtUnit(v, 1, 'kWh')} (${item.payload.included}/${item.payload.total} motors)`, 'Energy']} />
            <Legend />
            <Bar name="Energy (kWh)" dataKey="kwh" fill={COLORS.energy} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Power factor comparison" subtitle="Average while running; dashed line = low-PF limit" loading={report.loading} empty={noData(perMotor, 'pf')} emptyText={loadErr} note={noteFor('pf')}>
          <BarChart data={perMotor} margin={barMargin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="motorId" interval={0} {...axisProps} fontSize={11} />
            <YAxis {...axisProps} width={44} domain={[0, 1]} />
            <Tooltip {...tooltipProps} labelFormatter={(id) => `${id} · ${MOTOR_BY_ID[id]?.name}`} formatter={(v) => [fmtNum(v, 3), 'Power factor']} />
            <Legend />
            <ReferenceLine y={thresholds.lowPowerFactor} stroke={COLORS.threshold} strokeDasharray="4 4" />
            <Bar name="Avg power factor" dataKey="pf" fill={COLORS.pf} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Motor running-duration comparison" subtitle="Hours the motor was running in the period" loading={report.loading} empty={noData(perMotor, 'hours')} emptyText={loadErr} note={noteFor('hours')}>
          <BarChart data={perMotor} margin={barMargin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="motorId" interval={0} {...axisProps} fontSize={11} />
            <YAxis {...axisProps} width={44} unit=" h" />
            <Tooltip {...tooltipProps} labelFormatter={(id) => `${id} · ${MOTOR_BY_ID[id]?.name}`} formatter={(v) => [fmtUnit(v, 1, 'h'), 'Running time']} />
            <Legend />
            <Bar name="Running time (h)" dataKey="hours" fill={COLORS.current} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Daily energy consumption" subtitle="Total kWh per day, all motors" loading={report.loading} empty={noData(daily, 'kwh')} emptyText={loadErr}>
          <BarChart data={daily} margin={barMargin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" minTickGap={20} {...axisProps} />
            <YAxis {...axisProps} width={52} />
            <Tooltip {...tooltipProps} formatter={(v) => [fmtUnit(v, 1, 'kWh'), 'Energy']} />
            <Legend />
            <Bar name="Energy (kWh)" dataKey="kwh" fill={COLORS.bar} isAnimationActive={false} />
          </BarChart>
        </ChartCard>

        <div className="min-w-0 lg:col-span-2">
          <ChartCard title="Hourly power profile" subtitle="Average total active power by hour of day (plant local time)" loading={report.loading} empty={noData(hourly, 'kw')} emptyText={loadErr}>
            <LineChart data={hourly} margin={barMargin}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" interval={1} {...axisProps} />
              <YAxis {...axisProps} width={52} unit=" kW" />
              <Tooltip {...tooltipProps} formatter={(v) => [fmtUnit(v, 1, 'kW'), 'Average power']} />
              <Legend />
              <Line name="Average total power (kW)" type="monotone" dataKey="kw" stroke={COLORS.power} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} connectNulls={false} />
            </LineChart>
          </ChartCard>
        </div>
      </div>

      <Card title="Export CSV" subtitle="Uses the date range selected above. Unavailable values are exported as empty cells, never zero." className="mt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-600">Motor
            <select className="input mt-0.5 block" value={exportMotor} onChange={(e) => setExportMotor(e.target.value)}>
              <option value="all">All motors</option>
              {MOTORS.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={exportReadings} disabled={exporting}>
            <Download className="h-4 w-4" aria-hidden="true" /> {exporting ? 'Exporting…' : 'Readings (filtered)'}
          </button>
          <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
          <button type="button" className="btn" onClick={exportSummary} disabled={!r}><Download className="h-4 w-4" aria-hidden="true" /> Motor summary</button>
          <button type="button" className="btn" onClick={exportDaily} disabled={!daily.length}><Download className="h-4 w-4" aria-hidden="true" /> Daily energy</button>
          <button type="button" className="btn" onClick={exportPower} disabled={!power.length}><Download className="h-4 w-4" aria-hidden="true" /> Total power series</button>
        </div>
        {exportMsg && <p role="status" className={`mt-2 text-sm ${exportMsg.tone === 'warn' ? 'text-amber-800' : 'text-green-700'}`}>{exportMsg.text}</p>}
      </Card>
      <p className="mt-2 text-xs text-slate-500">{NA} / gaps mean no valid reading was stored for that motor and period.</p>
    </>
  );
}
