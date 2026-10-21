import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bell, ChartColumn, Cog, Eye, LayoutDashboard, Menu, Wifi, WifiOff, Workflow, X } from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext.jsx';
import { fmtTime } from '../utils/format.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/motors', label: 'Motors', icon: Cog },
  { to: '/process', label: 'Process Overview', icon: Workflow },
  { to: '/reports', label: 'Charts & Reports', icon: ChartColumn },
  { to: '/alerts', label: 'Alerts & Comms', icon: Bell, badge: true },
];

function ConnectionPill() {
  const { conn, loaded } = useLiveData();
  // if (conn.api === 'error') {
  //   return (
  //     <span className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800" title={conn.error}>
  //       <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> API unreachable
  //     </span>
  //   );
  // }
  // if (!loaded) return <span className="text-xs text-slate-500">Connecting…</span>;
  // return (
  //   <span className="inline-flex items-center gap-1.5 rounded border border-green-300 bg-green-50 px-2 py-1 text-xs font-semibold text-green-800" title={`Last update ${fmtTime(conn.lastOkAt)}`}>
  //     <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
  //     Live · {conn.transport === 'websocket' ? 'WebSocket' : 'polling'}
  //   </span>
  // );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { alerts, conn, loaded, source } = useLiveData();
  const { pathname } = useLocation();
  const critical = alerts.filter((a) => a.severity === 'critical').length;

  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1 px-3">
      {NAV.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-charcoal-600 text-white' : 'text-charcoal-300 hover:bg-charcoal-700 hover:text-white'}`
          }
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="flex-1">{label}</span>
          {badge && alerts.length > 0 && (
            <span className={`num rounded px-1.5 text-xs font-semibold ${critical ? 'bg-red-600 text-white' : 'bg-amber-500 text-charcoal-950'}`}>
              {alerts.length}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="px-5 py-4">
      <div className="text-sm font-semibold tracking-wide text-white">RICE MILL</div>
      <div className="text-xs text-charcoal-400">Energy &amp; Motor Monitoring</div>
    </div>
  );

  return (
    <div className="flex h-full min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-charcoal-900 lg:flex">
        {brand}
        {nav}
        <div className="mt-auto px-5 py-4 text-xs leading-relaxed text-charcoal-400">
          <div className="flex items-center gap-1.5 font-medium text-charcoal-300">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Monitoring only
          </div>
          Read-only view. No machinery can be started, stopped or adjusted from this application.
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-charcoal-900">
            <div className="flex items-center justify-between">
              {brand}
              <button type="button" className="mr-3 rounded p-2 text-charcoal-300 hover:bg-charcoal-700" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <button type="button" className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1 text-sm font-semibold text-slate-700 lg:hidden">Rice Mill Monitoring</div>
          <div className="hidden flex-1 text-xs text-slate-500 lg:block">Read-only monitoring · SELEC MFM384 meters via IoT gateways</div>
          {source === 'mock' && (
            <span className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800" title="Values come from the bundled development mock API, not real meters">
              SIMULATED DATA
            </span>
          )}
          <ConnectionPill />
        </header>

        {loaded && conn.api === 'error' && (
          <div role="alert" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            {conn.error}. Showing the last data received; readings will be marked stale and motor status will become UNKNOWN until the connection returns.
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
