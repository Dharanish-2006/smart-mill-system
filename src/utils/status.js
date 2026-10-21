// Turns raw gateway/meter payloads into trustworthy per-motor state.
//
// Rules that matter for a control room:
//  * Operating status (RUNNING / STOPPED / UNKNOWN) is separate from communication health.
//  * If communication cannot be verified (gateway offline, Modbus failure, no data, stale
//    reading) the status is UNKNOWN. A motor is NEVER assumed to be stopped.
//  * Invalid or implausible values become null (shown as N/A), never 0, and are reported as
//    "unexpected data" issues. Nulls are excluded from every total and average.

import { fmtAgeSeconds } from './format.js';

export const DEFAULT_THRESHOLDS = {
  runCurrentA: 0.5, // average current at/above which a motor counts as RUNNING
  highCurrentA: 60, // default high-current limit (override per motor)
  highPowerKw: 35, // default high-power limit (override per motor)
  lowPowerFactor: 0.8, // warn when a running motor is below this
  staleSeconds: 120, // reading older than this is stale
  motorOverrides: {}, // { M7: { highCurrentA: 55, highPowerKw: 28 } }
};

export function limitsFor(th, motorId) {
  const o = th.motorOverrides?.[motorId] || {};
  const pick = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
  return {
    highCurrentA: pick(o.highCurrentA, th.highCurrentA),
    highPowerKw: pick(o.highPowerKw, th.highPowerKw),
  };
}

export const MEASUREMENT_RULES = {
  avgCurrentA: { label: 'Average current', unit: 'A', min: 0, max: 5000 },
  powerFactor: { label: 'Power factor', unit: '', min: -1, max: 1 },
  activePowerKw: { label: 'Active power', unit: 'kW', min: 0, max: 10000 },
  reactivePowerKvar: { label: 'Reactive power', unit: 'kVAR', min: -10000, max: 10000 },
  apparentPowerKva: { label: 'Apparent power', unit: 'kVA', min: 0, max: 10000 },
  runtimeMinutes: { label: 'Total runtime', unit: 'min', min: 0, max: 1e8 },
  activeEnergyKwh: { label: 'Total active energy', unit: 'kWh', min: 0, max: 1e10 },
  reactiveEnergyKvarh: { label: 'Total reactive energy', unit: 'kVARh', min: 0, max: 1e10 },
  apparentEnergyKvah: { label: 'Total apparent energy', unit: 'kVAh', min: 0, max: 1e10 },
  maxDemandKw: { label: 'Maximum demand', unit: 'kW', min: 0, max: 10000 },
  loadFactorPct: { label: 'Load factor', unit: '%', min: 0, max: 100 },
};

export const MEASUREMENT_KEYS = Object.keys(MEASUREMENT_RULES);
const EMPTY_M = Object.freeze(Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, null])));

/**
 * Validate one measurement set. Missing -> null (no issue). Non-numeric or out-of-range ->
 * null plus an issue. Numeric strings are accepted (PostgreSQL NUMERIC arrives as a string).
 */
export function sanitizeMeasurements(raw) {
  const m = { ...EMPTY_M };
  const issues = [];
  if (!raw || typeof raw !== 'object') return { m, issues };

  for (const [key, rule] of Object.entries(MEASUREMENT_RULES)) {
    const v = raw[key];
    if (v === null || v === undefined || v === '') continue;
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
    const unit = rule.unit ? ` ${rule.unit}` : '';
    if (!Number.isFinite(n)) {
      issues.push({ field: key, message: `${rule.label}: "${String(v).slice(0, 20)}" is not a valid number` });
    } else if (n < rule.min || n > rule.max) {
      issues.push({ field: key, message: `${rule.label}: ${n}${unit} is outside the expected range (${rule.min} to ${rule.max})` });
    } else {
      m[key] = n;
    }
  }
  const { activePowerKw: kw, apparentPowerKva: kva } = m;
  if (kw != null && kva != null && kw > 0.1 && kva < kw * 0.95) {
    issues.push({ field: 'apparentPowerKva', message: `Apparent power (${kva} kVA) is lower than active power (${kw} kW)` });
  }
  return { m, issues };
}

export function parseTime(v) {
  if (v === null || v === undefined || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

const num = (v, min, max) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export const COMM = {
  OK: 'OK',
  MODBUS: 'MODBUS_ERROR',
  GATEWAY: 'GATEWAY_OFFLINE',
  STALE: 'STALE',
  NO_DATA: 'NO_DATA',
};

export const COMM_LABEL = {
  OK: 'Comm OK',
  MODBUS_ERROR: 'Modbus failure',
  GATEWAY_OFFLINE: 'Gateway offline',
  STALE: 'Stale reading',
  NO_DATA: 'No data',
};

const mkComm = (state, message) => ({ state, ok: state === COMM.OK, label: COMM_LABEL[state], message });

export function deriveGateways(rawList, nowMs, th = DEFAULT_THRESHOLDS) {
  const map = new Map();
  for (const g of Array.isArray(rawList) ? rawList : []) {
    if (!g || !g.id) continue;
    const lastSeenAt = parseTime(g.lastSeenAt);
    let online = g.online !== false;
    let reason = '';
    if (!online) reason = 'reported offline';
    else if (lastSeenAt != null && (nowMs - lastSeenAt) / 1000 > th.staleSeconds) {
      online = false;
      reason = `no heartbeat for ${fmtAgeSeconds((nowMs - lastSeenAt) / 1000)}`;
    }
    map.set(g.id, { id: g.id, name: g.name || g.id, online, reason, lastSeenAt });
  }
  return map;
}

/**
 * @param cfg      static motor config { id, name, sectionId }
 * @param raw      motor entry from /motors/live (may be undefined)
 * @param gateways Map from deriveGateways
 * @param nowMs    server-corrected "now"
 */
export function deriveMotor(cfg, raw, gateways, nowMs, th = DEFAULT_THRESHOLDS) {
  const gw = raw?.gatewayId ? gateways?.get(raw.gatewayId) : null;
  const lastReadingAt = parseTime(raw?.lastReadingAt);
  const ageSeconds = lastReadingAt == null ? null : (nowMs - lastReadingAt) / 1000;
  const { m: lastKnown, issues: rawIssues } = sanitizeMeasurements(raw?.measurements);
  const commStatus = raw?.commStatus == null ? 'OK' : String(raw.commStatus).toUpperCase();

  let comm;
  if (gw && !gw.online) comm = mkComm(COMM.GATEWAY, `Gateway ${gw.name} is offline (${gw.reason})`);
  else if (commStatus !== 'OK') {
    comm = mkComm(COMM.MODBUS, raw.commMessage || `Modbus read failed (${commStatus}) for meter slave ${raw.slaveId ?? '?'}`);
  } else if (!raw || lastReadingAt == null || !raw.measurements) {
    comm = mkComm(COMM.NO_DATA, 'No reading has been received from this meter');
  } else if (ageSeconds > th.staleSeconds) {
    comm = mkComm(COMM.STALE, `Last reading is ${fmtAgeSeconds(ageSeconds)} old (limit ${th.staleSeconds} s)`);
  } else comm = mkComm(COMM.OK, 'Meter responding normally');

  const issues = comm.ok ? [...rawIssues] : [];
  if (comm.ok && ageSeconds < -60) {
    issues.push({ field: 'lastReadingAt', message: 'Reading timestamp is in the future (check gateway clock)' });
  }
  const m = comm.ok ? lastKnown : { ...EMPTY_M };

  let status = 'UNKNOWN';
  if (comm.ok) {
    const reported = String(raw?.run?.state || '').toUpperCase();
    const reportedOk = reported === 'RUNNING' || reported === 'STOPPED';
    if (m.avgCurrentA != null) {
      status = m.avgCurrentA >= th.runCurrentA ? 'RUNNING' : 'STOPPED';
      if (reportedOk && reported !== status) {
        issues.push({ field: 'run.state', message: `Gateway reports ${reported} but measured current (${m.avgCurrentA} A) indicates ${status}` });
      }
    } else if (reportedOk) status = reported;
  }

  const r = raw?.run || {};
  const run = { onTime: null, offTime: null, durationMinutes: null, energyKwh: null, avgPowerFactor: null };
  if (comm.ok && status !== 'UNKNOWN') {
    run.onTime = parseTime(r.onTime);
    run.offTime = parseTime(r.offTime);
    if (status === 'RUNNING') {
      run.durationMinutes = num(r.durationMinutes, 0, 1e7) ?? (run.onTime != null ? Math.max(0, (nowMs - run.onTime) / 60000) : null);
      run.energyKwh = num(r.energyKwh, 0, 1e7);
      run.avgPowerFactor = num(r.avgPowerFactor, -1, 1);
    }
  }

  return {
    motorId: cfg.id,
    name: cfg.name,
    sectionId: cfg.sectionId,
    slaveId: raw?.slaveId ?? null,
    gatewayId: raw?.gatewayId ?? null,
    gatewayName: gw?.name ?? raw?.gatewayId ?? null,
    meterModel: raw?.meterModel ?? null,
    status,
    comm,
    lastReadingAt,
    ageSeconds,
    m,
    run,
    lastKnown,
    issues,
  };
}
