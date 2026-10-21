import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext.jsx';
import { Card, CommBadge, ErrorBanner, PageHeader, Spinner, StatusBadge, Empty } from '../components/ui.jsx';
import { NA, fmtAgeSeconds, fmtDateTime, fmtDuration, fmtNum, fmtUnit } from '../utils/format.js';
import { runCell } from '../utils/params.js';
import { downloadCsv, toCsv } from '../utils/csv.js';

const FILTERS = [
  { id: 'all', label: 'All motors', test: () => true },
  { id: 'running', label: 'Running', test: (d) => d.status === 'RUNNING' },
  { id: 'stopped', label: 'Stopped', test: (d) => d.status === 'STOPPED' },
  { id: 'unknown', label: 'Unknown status', test: (d) => d.status === 'UNKNOWN' },
  { id: 'comm', label: 'Communication errors', test: (d) => !d.comm.ok },
];

const num = (d) => Number(String(d.motorId).replace(/\D/g, ''));
const STATUS_ORDER = { RUNNING: 0, STOPPED: 1, UNKNOWN: 2 };

const COLUMNS = [
  { key: 'id', label: 'Motor ID', sort: num },
  { key: 'name', label: 'Motor Name', sort: (d) => d.name.toLowerCase() },
  { key: 'status', label: 'Status', sort: (d) => STATUS_ORDER[d.status] },
  { key: 'comm', label: 'Communication', sort: (d) => (d.comm.ok ? 0 : 1) },
  { key: 'current', label: 'Avg Current (A)', sort: (d) => d.m.avgCurrentA, right: true },
  { key: 'power', label: 'Active Power (kW)', sort: (d) => d.m.activePowerKw, right: true },
  { key: 'pf', label: 'Power Factor', sort: (d) => d.m.powerFactor, right: true },
  { key: 'energy', label: 'Total Active Energy (kWh)', sort: (d) => d.m.activeEnergyKwh, right: true },
  { key: 'duration', label: 'Running Duration', sort: (d) => d.run.durationMinutes, right: true },
  { key: 'updated', label: 'Last Updated', sort: (d) => d.lastReadingAt },
];

export default function Motors() {
  const { loaded, conn, motors } = useLiveData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filterId = FILTERS.some((f) => f.id === params.get('filter')) ? params.get('filter') : 'all';
  const q = params.get('q') || '';
  const [sort, setSort] = useState({ key: 'id', dir: 1 });

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (!v || v === 'all') next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, motors.filter(f.test).length])), [motors]);

  const rows = useMemo(() => {
    const filter = FILTERS.find((f) => f.id === filterId);
    const needle = q.trim().toLowerCase();
    const list = motors.filter(
      (d) => filter.test(d) && (!needle || d.motorId.toLowerCase().includes(needle) || d.name.toLowerCase().includes(needle)),
    );
    const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[0];
    return [...list].sort((a, b) => {
      const va = col.sort(a);
      const vb = col.sort(b);
      if (va == null && vb == null) return num(a) - num(b);
      if (va == null) return 1; // unavailable values always last
      if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir || num(a) - num(b);
    });
  }, [motors, filterId, q, sort]);

  const exportCsv = () => {
    const cols = [
      { header: 'Motor ID', value: (d) => d.motorId },
      { header: 'Motor Name', value: (d) => d.name },
      { header: 'Status', value: (d) => d.status },
      { header: 'Communication', value: (d) => d.comm.label },
      { header: 'Average Current (A)', value: (d) => d.m.avgCurrentA },
      { header: 'Active Power (kW)', value: (d) => d.m.activePowerKw },
      { header: 'Power Factor', value: (d) => d.m.powerFactor },
      { header: 'Total Active Energy (kWh)', value: (d) => d.m.activeEnergyKwh },
      { header: 'Running Duration (min)', value: (d) => d.run.durationMinutes },
      { header: 'Last Updated (ISO)', value: (d) => (d.lastReadingAt != null ? new Date(d.lastReadingAt).toISOString() : null) },
    ];
    downloadCsv(`motors-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`, toCsv(cols, rows));
  };

  if (!loaded) {
    return (
      <>
        <PageHeader title="Motors" />
        {conn.api === 'error' ? <ErrorBanner message={`${conn.error}. No live data has been received yet.`} /> : <Spinner label="Waiting for live data…" />}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Motors"
        subtitle="All 15 motors. Click a row for full details, trends and history."
        actions={
          <button type="button" className="btn" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
          </button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            className="input w-full pl-8"
            placeholder="Search motor ID or name"
            aria-label="Search motors"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter motors">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filterId === f.id}
              onClick={() => setParam('filter', f.id)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${filterId === f.id ? 'border-charcoal-800 bg-charcoal-800 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {f.label} <span className="num opacity-70">({counts[f.id]})</span>
            </button>
          ))}
        </div>
      </div>

      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className={`th ${c.right ? 'text-right' : ''}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 uppercase hover:text-slate-800"
                      onClick={() => setSort((s) => (s.key === c.key ? { key: c.key, dir: -s.dir } : { key: c.key, dir: 1 }))}
                    >
                      {c.label}
                      {sort.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => (
                <tr key={d.motorId} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/motors/${d.motorId}`)}>
                  <td className="td font-semibold">
                    <Link to={`/motors/${d.motorId}`} className="text-sky-800 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {d.motorId}
                    </Link>
                  </td>
                  <td className="td">{d.name}</td>
                  <td className="td"><StatusBadge status={d.status} size="sm" /></td>
                  <td className="td"><CommBadge comm={d.comm} size="sm" /></td>
                  <td className="td num text-right">{fmtNum(d.m.avgCurrentA, 2)}</td>
                  <td className="td num text-right">{fmtNum(d.m.activePowerKw, 2)}</td>
                  <td className="td num text-right">{fmtNum(d.m.powerFactor, 3)}</td>
                  <td className="td num text-right">{fmtNum(d.m.activeEnergyKwh, 1)}</td>
                  <td className="td num text-right">{runCell(d, fmtDuration(d.run.durationMinutes))}</td>
                  <td className="td">
                    <div>{fmtDateTime(d.lastReadingAt)}</div>
                    {d.ageSeconds != null && (
                      <div className={`text-xs ${d.comm.ok ? 'text-slate-400' : 'text-amber-700'}`}>{fmtAgeSeconds(d.ageSeconds)} ago</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty title="No motors match these filters">Try clearing the search or choosing “All motors”.</Empty>}
      </Card>
      <p className="mt-2 text-xs text-slate-500">
        {NA} means the value is unavailable (for example while a meter is not communicating). Live values are hidden for meters that cannot be verified. Unit legend: A = amperes, kW = kilowatts, kWh = kilowatt-hours.
      </p>
    </>
  );
}
