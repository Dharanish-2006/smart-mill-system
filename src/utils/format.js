export const NA = 'N/A';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Number with fixed decimals (Indian digit grouping). Unavailable -> N/A, never 0. */
export function fmtNum(v, digits = 2) {
  return isNum(v)
    ? v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : NA;
}

/** Number plus unit, or N/A. */
export function fmtUnit(v, digits, unit) {
  return isNum(v) ? `${fmtNum(v, digits)}${unit ? ` ${unit}` : ''}` : NA;
}

/** Minutes -> "42 min", "5 h 12 m", "3 d 4 h". */
export function fmtDuration(minutes) {
  if (!isNum(minutes) || minutes < 0) return NA;
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h < 48) return `${h} h ${String(m).padStart(2, '0')} m`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Seconds -> "45 s", "12 min", "3 h 10 m". */
export function fmtAgeSeconds(seconds) {
  if (!isNum(seconds)) return NA;
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 90) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} m`;
}

export function fmtDateTime(ts) {
  return isNum(ts)
    ? new Date(ts).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : NA;
}

export function fmtTime(ts) {
  return isNum(ts)
    ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : NA;
}

/** Tick label for a time axis: clock time for spans up to 2 days, otherwise the date. */
export function fmtAxisTime(ts, spanMs) {
  const d = new Date(ts);
  return spanMs <= 2 * 86_400_000
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function fmtTooltipTime(ts) {
  return isNum(ts)
    ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
}

/** ms -> "YYYY-MM-DD" (local) for <input type="date">. */
export const toDateInput = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** "YYYY-MM-DD" -> local midnight in ms (NaN when empty/invalid). */
export const parseDateInput = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
