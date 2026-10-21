import { Link } from 'react-router-dom';
import { ArrowDown, ChevronRight, Eye, WifiOff } from 'lucide-react';
import { SECTIONS, motorsInSection } from '../config/motors.js';
import { useLiveData } from '../context/LiveDataContext.jsx';
import { Card, ErrorBanner, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { fmtNum, fmtUnit } from '../utils/format.js';

const DOT = { RUNNING: 'bg-green-600', STOPPED: 'bg-red-600', UNKNOWN: 'bg-amber-500' };

function sectionTone(list) {
  if (list.some((d) => d.status === 'UNKNOWN')) return 'border-t-amber-500';
  if (list.some((d) => d.status === 'STOPPED')) return 'border-t-red-600';
  return 'border-t-green-600';
}

export default function Process() {
  const { loaded, conn, motorById } = useLiveData();

  if (!loaded) {
    return (
      <>
        <PageHeader title="Process Overview" />
        {conn.api === 'error' ? <ErrorBanner message={`${conn.error}. No live data has been received yet.`} /> : <Spinner label="Waiting for live data…" />}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Process Overview" subtitle="Production flow from paddy receiving to packing, in 11 sections." />


      <ol className="grid grid-cols-1 gap-x-7 gap-y-3 md:grid-cols-2 md:gap-y-6 lg:grid-cols-4">
        {SECTIONS.map((sec, idx) => {
          const list = motorsInSection(sec.id).map((m) => motorById[m.id]);
          const valid = list.filter((d) => d.comm.ok && d.m.activePowerKw != null);
          const total = valid.reduce((sum, d) => sum + d.m.activePowerKw, 0);
          const running = list.filter((d) => d.status === 'RUNNING').length;
          const stopped = list.filter((d) => d.status === 'STOPPED').length;
          const unknown = list.filter((d) => d.status === 'UNKNOWN').length;
          const last = idx === SECTIONS.length - 1;
          return (
            <li key={sec.id} className="relative">
              <Card className={`border-t-4 ${sectionTone(list)} h-full`} bodyClassName="p-0">
                <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Section {sec.order}</div>
                    <h2 className="text-sm font-semibold leading-snug text-slate-900">{sec.name}</h2>
                  </div>
                  <div className="text-right">
                    <div className={`num whitespace-nowrap text-base font-semibold ${valid.length ? 'text-slate-900' : 'text-slate-400'}`}>
                      {valid.length ? fmtUnit(total, 2, 'kW') : 'N/A'}
                    </div>
                    <div className="text-[11px] text-slate-500">{valid.length} of {list.length} meters</div>
                  </div>
                </div>
                <div className="px-3.5 pb-1 pt-1 text-xs text-slate-500">
                  <span className="text-green-700">{running} running</span> · <span className="text-red-700">{stopped} stopped</span> · <span className="text-amber-700">{unknown} unknown</span>
                </div>
                <ul className="mt-1 divide-y divide-slate-100 border-t border-slate-100">
                  {list.map((d) => (
                    <li key={d.motorId}>
                      <Link to={`/motors/${d.motorId}`} className="flex items-center gap-2 px-3.5 py-2 hover:bg-slate-50">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[d.status]}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">{d.motorId} · {d.name}</span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <StatusBadge status={d.status} size="sm" />
                            {!d.comm.ok && (
                              <span className="inline-flex items-center gap-0.5 text-amber-700" title={d.comm.message}>
                                <WifiOff className="h-3 w-3" aria-hidden="true" /> {d.comm.label}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="num text-sm font-medium text-slate-700">{fmtNum(d.m.activePowerKw, 2)}<span className="ml-0.5 text-xs text-slate-400">{d.m.activePowerKw != null ? 'kW' : ''}</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>

              {!last && (
                <>
                  <ChevronRight
                    aria-hidden="true"
                    className={`absolute -right-[1.45rem] top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-slate-400 ${idx % 2 === 0 ? 'md:max-lg:block' : ''} ${idx % 4 !== 3 ? 'lg:block' : ''}`}
                  />
                  <ArrowDown aria-hidden="true" className="mx-auto mt-2 h-4 w-4 text-slate-400 md:hidden" />
                </>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-slate-500">
        Border colour: green = all motors in the section running, red = at least one confirmed stopped, amber = at least one status UNKNOWN (communication problem). Section power sums valid readings only.
      </p>
    </>
  );
}
