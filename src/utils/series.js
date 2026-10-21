import { parseTime, sanitizeMeasurements } from './status.js';

/**
 * Historical rows from the API -> chart-ready rows.
 * Each row is validated like a live reading: invalid values become null, so charts show a gap
 * instead of a fake zero. Power factor is only meaningful while the motor is drawing current,
 * so `pfWhileRunning` is null when the motor is stopped.
 */
export function prepareReadings(rows, th) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const t = parseTime(r?.ts);
    if (t == null) continue;
    const { m } = sanitizeMeasurements(r);
    const running = m.avgCurrentA == null ? null : m.avgCurrentA >= th.runCurrentA;
    out.push({
      t,
      ...m,
      running,
      pfWhileRunning: running && m.powerFactor != null ? Math.abs(m.powerFactor) : null,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Energy used between consecutive readings, from the cumulative kWh register. */
export function energyDeltas(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1].activeEnergyKwh;
    const b = rows[i].activeEnergyKwh;
    out.push({ t: rows[i].t, kwh: a != null && b != null && b >= a ? b - a : null });
  }
  return out;
}
