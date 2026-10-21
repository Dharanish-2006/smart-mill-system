import { CircleAlert, CircleHelp, CircleCheck, Loader2, OctagonX, Wifi, WifiOff } from 'lucide-react';
import { NA } from '../utils/format.js';

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = '', bodyClassName = 'p-4' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLE = {
  RUNNING: { cls: 'bg-green-50 text-green-800 border-green-300', Icon: CircleCheck },
  STOPPED: { cls: 'bg-red-50 text-red-800 border-red-300', Icon: OctagonX },
  UNKNOWN: { cls: 'bg-amber-50 text-amber-800 border-amber-300', Icon: CircleHelp },
};

/** Motor operating status. Always icon + text so colour is never the only signal. */
export function StatusBadge({ status, size = 'md' }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.UNKNOWN;
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded border font-semibold ${pad} ${s.cls}`}>
      <s.Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {status || 'UNKNOWN'}
    </span>
  );
}

/** Communication health, shown separately from operating status. */
export function CommBadge({ comm, size = 'md' }) {
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs';
  if (comm.ok) {
    return (
      <span className={`inline-flex items-center gap-1 rounded border border-slate-200 bg-white font-medium text-slate-600 ${pad}`}>
        <Wifi className="h-3.5 w-3.5 text-green-700" aria-hidden="true" />
        {comm.label}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 font-semibold text-amber-800 ${pad}`} title={comm.message}>
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      {comm.label}
    </span>
  );
}

const SEVERITY_STYLE = {
  critical: 'bg-red-50 text-red-800 border-red-300',
  warning: 'bg-amber-50 text-amber-800 border-amber-300',
  info: 'bg-sky-50 text-sky-800 border-sky-300',
};

export function SeverityBadge({ severity }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold capitalize ${SEVERITY_STYLE[severity] || SEVERITY_STYLE.info}`}>
      <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
      {severity}
    </span>
  );
}

export function ErrorBanner({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {children && <p className="mt-1 text-sm text-slate-500">{children}</p>}
    </div>
  );
}

const TONE = {
  neutral: 'text-slate-900',
  good: 'text-green-700',
  bad: 'text-red-700',
  warn: 'text-amber-700',
};

/** Compact summary card. `value` may be a string ("N/A") or number-formatted string. */
export function StatCard({ label, value, unit, sub, icon: Icon, tone = 'neutral' }) {
  const isNA = value === NA;
  return (
    <div className="card flex flex-col gap-1 p-3.5">
      <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
      </div>
      <div className={`num text-2xl font-semibold leading-tight ${isNA ? 'text-slate-400' : TONE[tone]}`}>
        {value}
        {!isNA && unit && <span className="ml-1 text-sm font-medium text-slate-500">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 text-sm font-medium ${value === o.id ? 'bg-charcoal-800 text-white' : 'text-slate-600 hover:bg-slate-50'} ${o.id !== options[0].id ? 'border-l border-slate-300' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
