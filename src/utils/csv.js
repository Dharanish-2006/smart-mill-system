/** One CSV cell. Unavailable values are written empty (never 0); text is guarded against formula injection. */
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** columns: [{ header, key } | { header, value: (row) => any }] */
export function toCsv(columns, rows) {
  const head = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','));
  return [head, ...body].join('\r\n');
}

export function downloadCsv(filename, csv) {
  // BOM so Excel opens UTF-8 correctly.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Columns for exporting historical readings (row = sanitized measurements + t, motorId, motorName). */
export const READING_COLUMNS = [
  { header: 'Timestamp (ISO)', value: (r) => (r.t != null ? new Date(r.t).toISOString() : null) },
  { header: 'Motor ID', key: 'motorId' },
  { header: 'Motor Name', key: 'motorName' },
  { header: 'Average Current (A)', key: 'avgCurrentA' },
  { header: 'Power Factor', key: 'powerFactor' },
  { header: 'Active Power (kW)', key: 'activePowerKw' },
  { header: 'Reactive Power (kVAR)', key: 'reactivePowerKvar' },
  { header: 'Apparent Power (kVA)', key: 'apparentPowerKva' },
  { header: 'Total Runtime (min)', key: 'runtimeMinutes' },
  { header: 'Total Active Energy (kWh)', key: 'activeEnergyKwh' },
  { header: 'Total Reactive Energy (kVARh)', key: 'reactiveEnergyKvarh' },
  { header: 'Total Apparent Energy (kVAh)', key: 'apparentEnergyKvah' },
  { header: 'Maximum Demand (kW)', key: 'maxDemandKw' },
  { header: 'Load Factor (%)', key: 'loadFactorPct' },
];
