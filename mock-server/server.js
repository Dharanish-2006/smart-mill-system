

import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 4000);
const TZ_MIN = Number(process.env.MOCK_TZ_OFFSET_MIN ?? 330);
const FAULTS = process.env.MOCK_FAULTS !== '0';
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const BOOT = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GATEWAYS = [
  { id: 'GW-1', name: 'Gateway 1' },
  { id: 'GW-2', name: 'Gateway 2' },
];

// id, name, rated kW, gateway, Modbus slave id
const DEFS = [
  ['M1', 'Receiving Hopper', 7.5, 'GW-1', 1], ['M2', 'Pre-Cleaner', 11, 'GW-1', 2],
  ['M3', 'Paddy Separator', 5.5, 'GW-1', 3], ['M4', 'De-Stoner', 3.7, 'GW-1', 4],
  ['M5', 'Rubber Roll Husker', 22, 'GW-1', 5], ['M6', 'Paddy Separator / Polisher', 7.5, 'GW-1', 6],
  ['M7', 'Rice Polisher', 30, 'GW-1', 7], ['M8', 'Vibro Separator', 3.7, 'GW-1', 8],
  ['M9', 'Rice Grader', 5.5, 'GW-2', 1], ['M10', 'Broken Rice Separator', 3.7, 'GW-2', 2],
  ['M11', 'Rice Whitener', 37, 'GW-2', 3], ['M12', 'Color Sorter', 5.5, 'GW-2', 4],
  ['M13', 'Rice Silo 1 (Head Rice)', 3.7, 'GW-2', 5], ['M14', 'Rice Silo 2 (Broken Rice)', 3.7, 'GW-2', 6],
  ['M15', 'Rice Packing', 7.5, 'GW-2', 7],
].map(([id, name, kw, gw, slave], idx) => ({ id, name, kw, gw, slave, idx }));

// ---------- timeline ----------
const N_HIST = 30 * 1440; // minutes of history; index N_HIST is "the current minute"
const N_TOTAL = N_HIST + 3 * 1440 + 1;
const START = Math.floor(BOOT / MIN) * MIN - N_HIST * MIN;
const tsOf = (i) => START + i * MIN;
const localDate = (ts) => new Date(ts + TZ_MIN * MIN).toISOString().slice(0, 10);
const localHour = (ts) => new Date(ts + TZ_MIN * MIN).getUTCHours();

function buildSchedule(def) {
  const rng = mulberry32(1000 + def.idx * 7919);
  const s = new Uint8Array(N_TOTAL);
  let state = 0;
  let remaining = 0;
  let prevIn = false;
  for (let i = 0; i < N_TOTAL; i += 1) {
    const h = localHour(tsOf(i));
    if (h < 6 || h >= 22) { state = 0; remaining = 0; prevIn = false; continue; } // shift 06:00-22:00
    if (!prevIn) { prevIn = true; state = 0; remaining = def.idx * 3; } // staggered start-up
    if (remaining <= 0) {
      state = state ? 0 : 1;
      remaining = state ? 60 + Math.floor(rng() * 180) : 8 + Math.floor(rng() * 40);
    }
    remaining -= 1;
    s[i] = state;
  }
  return s;
}

// ---------- scripted faults (anchored to server start so they appear within ~10 minutes) ----------
function faultsAt(now) {
  const out = { timeout: new Set(), stale: new Set(), badPf: new Set(), gw: new Set() };
  if (!FAULTS) return out;
  const s = (now - BOOT) / 1000;
  const p600 = s % 600;
  const p1800 = s % 1800;
  if (p600 >= 60 && p600 < 120) out.timeout.add('M12'); // Modbus timeout for 1 min
  if (p600 >= 180 && p600 < 300) out.badPf.add('M4'); // meter reports PF 1.35
  if (p600 >= 240 && p600 < 420) out.stale.add('M6'); // reading freezes for 3 min
  if (p1800 >= 600 && p1800 < 720) out.gw.add('GW-2'); // gateway offline for 2 min
  return out;
}
const spikeActive = (ts) => FAULTS && ts >= BOOT && (((ts - BOOT) / 1000) % 900) >= 420 && (((ts - BOOT) / 1000) % 900) < 540;

// ---------- per-motor simulation ----------
class Sim {
  constructor(def) {
    this.def = def;
    this.sched = buildSchedule(def);
    this.rng = mulberry32(5000 + def.idx * 104729);
    this.rows = [];
    this.events = [];
    this.energy = 8000 + this.rng() * 30000;
    this.kvarh = this.energy * 0.55;
    this.kvah = this.energy * 1.17;
    this.runtime = Math.floor(2000 + this.rng() * 40000);
    this.prevRunning = false;
    this.onMs = null;
    this.offMs = null;
    this.runEnergy = 0;
    this.pfSum = 0;
    this.pfN = 0;
    this.monthKey = -1;
    this.maxDemand = 0;
    this.monthEnergy = 0;
    this.monthMinutes = 0;
    this.roll = [];
    this.rollSum = 0;
    this.last = null;
    this.lastIdx = -1;
  }

  step(i) {
    const { def } = this;
    const ts = tsOf(i);
    const running = this.sched[i] === 1;
    const d = new Date(ts + TZ_MIN * MIN);
    const mk = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (mk !== this.monthKey) { this.monthKey = mk; this.maxDemand = 0; this.monthEnergy = 0; this.monthMinutes = 0; }

    if (running && !this.prevRunning) {
      this.onMs = ts; this.runEnergy = 0; this.pfSum = 0; this.pfN = 0;
      this.events.push({ ts: iso(ts), state: 'RUNNING', message: 'Motor started (current above run threshold)' });
    }
    if (!running && this.prevRunning) {
      this.offMs = ts;
      this.events.push({ ts: iso(ts), state: 'STOPPED', message: 'Motor stopped' });
    }
    this.prevRunning = running;

    let kw = 0; let pf = 0; let amps = 0; let kva = 0; let kvar = 0;
    if (running) {
      let load = clamp(0.62 + 0.14 * Math.sin(i / (37 + def.idx * 3)) + (this.rng() - 0.5) * 0.06, 0.42, 0.8);
      if (def.id === 'M7' && spikeActive(ts)) load = 1.35;
      kw = def.kw * load;
      pf = clamp(0.76 + 0.14 * Math.min(load, 0.9) + (this.rng() - 0.5) * 0.01, 0.5, 0.99);
      amps = (kw * 1000) / (Math.sqrt(3) * 415 * pf);
      kva = kw / pf;
      kvar = Math.sqrt(Math.max(0, kva * kva - kw * kw));
      this.pfSum += pf; this.pfN += 1; this.runEnergy += kw / 60;
    }
    this.energy += kw / 60; this.kvarh += kvar / 60; this.kvah += kva / 60;
    if (running) this.runtime += 1;
    this.monthEnergy += kw / 60; this.monthMinutes += 1;
    this.roll.push(kw); this.rollSum += kw;
    if (this.roll.length > 15) this.rollSum -= this.roll.shift();
    if (this.roll.length === 15) this.maxDemand = Math.max(this.maxDemand, this.rollSum / 15);
    const lf = this.maxDemand > 0 && this.monthMinutes >= 15
      ? Math.min(100, (this.monthEnergy / (this.monthMinutes / 60) / this.maxDemand) * 100) : null;

    const row = {
      ts, running,
      avgCurrentA: r2(amps), powerFactor: r3(pf), activePowerKw: r3(kw), reactivePowerKvar: r3(kvar), apparentPowerKva: r3(kva),
      runtimeMinutes: this.runtime, activeEnergyKwh: r2(this.energy), reactiveEnergyKvarh: r2(this.kvarh), apparentEnergyKvah: r2(this.kvah),
      maxDemandKw: r3(this.maxDemand), loadFactorPct: lf == null ? null : r2(lf),
    };
    this.last = row;
    this.lastIdx = i;
    return row;
  }
}

const sims = DEFS.map((d) => new Sim(d));
for (const sim of sims) {
  for (let i = 0; i <= N_HIST; i += 1) {
    const row = sim.step(i);
    if (i >= N_HIST - 1440 || i % 5 === 0) sim.rows.push(row); // 1-min for last 24 h, 5-min before that
  }
}
let lastMinuteIdx = N_HIST;

// ---------- alert log + fault tracking ----------
const alertLog = [];
let alertSeq = 1;
const logAlert = (ts, motorId, type, severity, description) =>
  alertLog.push({ id: `A${alertSeq++}`, timestamp: iso(ts), motorId, type, severity, description });
const simOf = (id) => sims.find((s) => s.def.id === id);

let prev = { timeout: new Set(), stale: new Set(), badPf: new Set(), gw: new Set() };
function trackFaults(now, f) {
  const diff = (key, onStart, onEnd) => {
    for (const id of f[key]) if (!prev[key].has(id)) onStart(id);
    for (const id of prev[key]) if (!f[key].has(id)) onEnd?.(id);
  };
  const unknown = (id, msg) => simOf(id).events.push({ ts: iso(now), state: 'UNKNOWN', message: msg });
  const restored = (id) => {
    const s = simOf(id);
    s.events.push({ ts: iso(now), state: s.last.running ? 'RUNNING' : 'STOPPED', message: 'Communication restored; status verified' });
    logAlert(now, id, 'RECOVERED', 'info', 'Communication restored');
  };
  diff('timeout', (id) => {
    const d = simOf(id).def;
    logAlert(now, id, 'MODBUS_FAILURE', 'warning', `Modbus timeout: no response from meter slave ${d.slave} on ${d.gw}`);
    unknown(id, 'Communication lost (Modbus timeout): status cannot be verified');
  }, restored);
  diff('stale', (id) => {
    logAlert(now, id, 'STALE_READING', 'warning', 'Meter readings stopped updating (value frozen)');
    unknown(id, 'Readings stopped updating: status cannot be verified');
  }, restored);
  diff('badPf', (id) => logAlert(now, id, 'UNEXPECTED_DATA', 'warning', 'Power factor: 1.35 is outside the expected range (-1 to 1)'));
  diff('gw', (gwId) => {
    for (const d of DEFS.filter((x) => x.gw === gwId)) {
      logAlert(now, d.id, 'GATEWAY_OFFLINE', 'warning', `${gwId} stopped sending heartbeats`);
      unknown(d.id, `${gwId} offline: status cannot be verified`);
    }
  }, (gwId) => DEFS.filter((x) => x.gw === gwId).forEach((d) => restored(d.id)));
  prev = { timeout: new Set(f.timeout), stale: new Set(f.stale), badPf: new Set(f.badPf), gw: new Set(f.gw) };
}

const isFaulted = (def, f) => f.timeout.has(def.id) || f.stale.has(def.id) || f.gw.has(def.gw);

function advanceMinutes(now, f) {
  const cur = Math.floor((now - START) / MIN);
  while (lastMinuteIdx < cur) {
    lastMinuteIdx += 1;
    for (const sim of sims) {
      const row = sim.step(lastMinuteIdx);
      if (isFaulted(sim.def, f)) continue; // nothing is stored while the meter is unreachable -> a real gap
      sim.rows.push(f.badPf.has(sim.def.id) ? { ...row, powerFactor: 1.35 } : row);
      while (sim.rows.length && sim.rows[0].ts < now - 30 * DAY) sim.rows.shift();
    }
  }
}

// ---------- live snapshot ----------
function liveValues(sim, now) {
  const r = sim.last;
  const frac = clamp((now - tsOf(sim.lastIdx)) / MIN, 0, 1);
  const j = r.running ? 1 + Math.sin(now / 3000 + sim.def.idx) * 0.01 : 1;
  const kw = r.activePowerKw * j;
  const kva = r.apparentPowerKva * j;
  const kvar = r.reactivePowerKvar * j;
  const measurements = {
    avgCurrentA: r2(r.avgCurrentA * j), powerFactor: r.powerFactor, activePowerKw: r3(kw), reactivePowerKvar: r3(kvar), apparentPowerKva: r3(kva),
    runtimeMinutes: r.runtimeMinutes, activeEnergyKwh: r2(r.activeEnergyKwh + (kw * frac) / 60),
    reactiveEnergyKvarh: r2(r.reactiveEnergyKvarh + (kvar * frac) / 60), apparentEnergyKvah: r2(r.apparentEnergyKvah + (kva * frac) / 60),
    maxDemandKw: r.maxDemandKw, loadFactorPct: r.loadFactorPct,
  };
  const run = {
    state: r.running ? 'RUNNING' : 'STOPPED',
    onTime: sim.onMs ? iso(sim.onMs) : null,
    offTime: sim.offMs ? iso(sim.offMs) : null,
    durationMinutes: r.running && sim.onMs ? r2((now - sim.onMs) / MIN) : null,
    energyKwh: r.running ? r2(sim.runEnergy + (kw * frac) / 60) : null,
    avgPowerFactor: r.running && sim.pfN ? r3(sim.pfSum / sim.pfN) : null,
  };
  return { measurements, run };
}

const frozen = {}; // last healthy reading per motor (used while faulted)
const gwFrozen = {};
function captureFrozen(now, f) {
  for (const sim of sims) {
    if (!isFaulted(sim.def, f)) frozen[sim.def.id] = { ts: now, ...liveValues(sim, now) };
  }
  for (const g of GATEWAYS) if (!f.gw.has(g.id)) gwFrozen[g.id] = now;
}

function buildSnapshot(now) {
  const f = faultsAt(now);
  const gateways = GATEWAYS.map((g) => ({ id: g.id, name: g.name, online: !f.gw.has(g.id), lastSeenAt: iso(f.gw.has(g.id) ? gwFrozen[g.id] ?? now : now) }));
  const motors = sims.map((sim) => {
    const d = sim.def;
    const base = { motorId: d.id, slaveId: d.slave, gatewayId: d.gw, meterModel: 'SELEC MFM384' };
    const fr = frozen[d.id];
    if (f.timeout.has(d.id)) {
      return { ...base, lastReadingAt: iso(fr?.ts ?? now), commStatus: 'TIMEOUT', commMessage: `Modbus timeout: no response from meter slave ${d.slave} on ${d.gw}`, measurements: null, run: null };
    }
    if (f.stale.has(d.id) || f.gw.has(d.gw)) {
      const live = liveValues(sim, now);
      return { ...base, lastReadingAt: iso(fr?.ts ?? now), commStatus: 'OK', measurements: fr?.measurements ?? live.measurements, run: fr?.run ?? live.run };
    }
    const live = liveValues(sim, now);
    const m = { ...live.measurements };
    if (f.badPf.has(d.id)) m.powerFactor = 1.35;
    return { ...base, lastReadingAt: iso(now), commStatus: 'OK', measurements: m, run: live.run };
  });
  return { serverTime: iso(now), meta: { source: 'mock' }, gateways, motors };
}

// ---------- history helpers ----------
const lowerBound = (rows, ts) => {
  let lo = 0; let hi = rows.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid].ts < ts) lo = mid + 1; else hi = mid; }
  return lo;
};
const FIELDS = ['avgCurrentA', 'powerFactor', 'activePowerKw', 'reactivePowerKvar', 'apparentPowerKva', 'runtimeMinutes', 'activeEnergyKwh', 'reactiveEnergyKvarh', 'apparentEnergyKvah', 'maxDemandKw', 'loadFactorPct'];

function bucketize(rows, from, to, bucket) {
  const out = [];
  let k = lowerBound(rows, from);
  for (let b = from; b < to; b += bucket) {
    const end = b + bucket;
    let n = 0; let nRun = 0; let sI = 0; let sPf = 0; let sKw = 0; let sKvar = 0; let sKva = 0; let last = null;
    while (k < rows.length && rows[k].ts < end) {
      const r = rows[k]; n += 1; sI += r.avgCurrentA; sKw += r.activePowerKw; sKvar += r.reactivePowerKvar; sKva += r.apparentPowerKva;
      if (r.avgCurrentA > 0.5) { nRun += 1; sPf += r.powerFactor; }
      last = r; k += 1;
    }
    if (!n) { out.push({ ts: iso(b), ...Object.fromEntries(FIELDS.map((x) => [x, null])) }); continue; }
    out.push({
      ts: iso(b), avgCurrentA: r2(sI / n), powerFactor: nRun ? r3(sPf / nRun) : 0, activePowerKw: r3(sKw / n), reactivePowerKvar: r3(sKvar / n), apparentPowerKva: r3(sKva / n),
      runtimeMinutes: last.runtimeMinutes, activeEnergyKwh: last.activeEnergyKwh, reactiveEnergyKvarh: last.reactiveEnergyKvarh, apparentEnergyKvah: last.apparentEnergyKvah,
      maxDemandKw: last.maxDemandKw, loadFactorPct: last.loadFactorPct,
    });
  }
  return out;
}

// Energy / runtime used between consecutive stored readings, grouped by a key (local day, month ...)
function deltasBy(rows, from, to, keyFn) {
  const map = new Map();
  let prevRow = null;
  for (let k = lowerBound(rows, from); k < rows.length && rows[k].ts <= to; k += 1) {
    const r = rows[k];
    if (prevRow) {
      const key = keyFn(r.ts);
      const e = map.get(key) || { kwh: 0, runtime: 0, days: new Set() };
      const dk = r.activeEnergyKwh - prevRow.activeEnergyKwh;
      const dr = r.runtimeMinutes - prevRow.runtimeMinutes;
      if (dk >= 0) e.kwh += dk;
      if (dr >= 0) e.runtime += dr;
      e.days.add(localDate(r.ts));
      map.set(key, e);
    }
    prevRow = r;
  }
  return map;
}

const HISTORY_RANGES = { '1h': [HOUR, MIN], '24h': [DAY, 5 * MIN], '7d': [7 * DAY, 30 * MIN], '30d': [30 * DAY, 2 * HOUR] };

function motorHistory(sim, range) {
  const [span, bucket] = HISTORY_RANGES[range];
  const to = Date.now();
  const daily = [...deltasBy(sim.rows, to - 30 * DAY, to, localDate)].map(([date, e]) => ({ date, energyKwh: r2(e.kwh), runtimeMinutes: Math.round(e.runtime) })).sort((a, b) => a.date.localeCompare(b.date));
  const monthly = [...deltasBy(sim.rows, to - 30 * DAY, to, (ts) => localDate(ts).slice(0, 7))]
    .map(([month, e]) => ({ month, energyKwh: r2(e.kwh), runtimeMinutes: Math.round(e.runtime), daysCovered: e.days.size })).sort((a, b) => a.month.localeCompare(b.month));
  return {
    meta: { source: 'mock', range, from: iso(to - span), to: iso(to), bucketSeconds: bucket / 1000 },
    readings: bucketize(sim.rows, to - span, to, bucket),
    daily, monthly,
    events: sim.events.filter((e) => Date.parse(e.ts) >= to - 30 * DAY).slice(-400),
  };
}

function buildReport(from, to) {
  const span = to - from;
  const bucket = span <= 1.01 * DAY ? 5 * MIN : span <= 7.01 * DAY ? 30 * MIN : 2 * HOUR;
  const perMotor = sims.map((s) => bucketize(s.rows, from, to, bucket));
  const n = perMotor[0]?.length ?? 0;
  const totalPowerSeries = [];
  for (let b = 0; b < n; b += 1) {
    let sum = 0; let meters = 0;
    for (const series of perMotor) if (series[b].activePowerKw != null) { sum += series[b].activePowerKw; meters += 1; }
    totalPowerSeries.push({ ts: perMotor[0][b].ts, totalKw: meters ? r3(sum) : null, meters });
  }
  const hourSum = Array.from({ length: 24 }, () => ({ s: 0, n: 0 }));
  for (const p of totalPowerSeries) if (p.totalKw != null) { const h = localHour(Date.parse(p.ts)); hourSum[h].s += p.totalKw; hourSum[h].n += 1; }
  const hourlyProfile = hourSum.map((x, hour) => ({ hour, avgKw: x.n ? r2(x.s / x.n) : null }));

  const energyByMotor = sims.map((s) => {
    const lo = lowerBound(s.rows, from);
    const rows = [];
    for (let k = lo; k < s.rows.length && s.rows[k].ts <= to; k += 1) rows.push(s.rows[k]);
    if (rows.length < 2) return { motorId: s.def.id, energyKwh: null, runtimeMinutes: null, avgPowerFactor: null };
    const e = [...deltasBy(s.rows, from, to, () => 'all').values()][0];
    const pf = rows.filter((r) => r.activePowerKw > 0.05 && r.powerFactor >= 0 && r.powerFactor <= 1);
    return { motorId: s.def.id, energyKwh: r2(e?.kwh ?? 0), runtimeMinutes: Math.round(e?.runtime ?? 0), avgPowerFactor: pf.length ? r3(pf.reduce((a, r) => a + r.powerFactor, 0) / pf.length) : null };
  });

  const dayTotals = new Map();
  for (const s of sims) for (const [date, e] of deltasBy(s.rows, from, to, localDate)) dayTotals.set(date, (dayTotals.get(date) || 0) + e.kwh);
  const dailyEnergy = [...dayTotals].map(([date, kwh]) => ({ date, energyKwh: r2(kwh) })).sort((a, b) => a.date.localeCompare(b.date));

  return { meta: { source: 'mock', from: iso(from), to: iso(to), bucketSeconds: bucket / 1000 }, totalPowerSeries, energyByMotor, dailyEnergy, hourlyProfile };
}

function alertEvents(from, to) {
  const status = sims.flatMap((s) => s.events.map((e, i) => ({
    id: `S-${s.def.id}-${i}`, timestamp: e.ts, motorId: s.def.id,
    type: e.state === 'UNKNOWN' ? 'STATUS_CHANGE' : 'STATUS_CHANGE', severity: 'info',
    description: `${s.def.name}: status changed to ${e.state}. ${e.message}`,
  })));
  return [...alertLog, ...status].filter((e) => { const t = Date.parse(e.timestamp); return t >= from && t <= to; })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 2000);
}

// ---------- HTTP ----------
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
const parseTs = (v, fallback) => { const t = Date.parse(v); return Number.isFinite(t) ? t : fallback; };

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed (this API is read-only)' });
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname.replace(/\/+$/, '');
  const q = url.searchParams;
  const now = Date.now();
  try {
    if (p === '/api/health') return send(res, 200, { status: 'ok', source: 'mock', faults: FAULTS });
    if (p === '/api/motors/live') return send(res, 200, buildSnapshot(now));
    let m = p.match(/^\/api\/motors\/([^/]+)\/history$/);
    if (m) {
      const sim = simOf(decodeURIComponent(m[1]));
      if (!sim) return send(res, 404, { error: 'Unknown motor' });
      const range = q.get('range') || '24h';
      if (!HISTORY_RANGES[range]) return send(res, 400, { error: 'range must be one of 1h, 24h, 7d, 30d' });
      return send(res, 200, motorHistory(sim, range));
    }
    if (p === '/api/reports') {
      const to = parseTs(q.get('to'), now);
      const from = parseTs(q.get('from'), to - DAY);
      if (from >= to) return send(res, 400, { error: 'from must be before to' });
      return send(res, 200, buildReport(from, to));
    }
    if (p === '/api/readings') {
      const to = parseTs(q.get('to'), now);
      const from = parseTs(q.get('from'), to - DAY);
      const id = q.get('motorId');
      if (id && !simOf(id)) return send(res, 404, { error: 'Unknown motor' });
      const LIMIT = 100_000;
      const out = [];
      for (const s of id ? [simOf(id)] : sims) {
        for (let k = lowerBound(s.rows, from); k < s.rows.length && s.rows[k].ts <= to; k += 1) {
          if (out.length >= LIMIT) break;
          const r = s.rows[k];
          out.push({ ts: iso(r.ts), motorId: s.def.id, ...Object.fromEntries(FIELDS.map((x) => [x, r[x]])) });
        }
      }
      return send(res, 200, { readings: out, truncated: out.length >= LIMIT });
    }
    if (p === '/api/alerts/events') {
      const to = parseTs(q.get('to'), now);
      return send(res, 200, { meta: { source: 'mock' }, events: alertEvents(parseTs(q.get('from'), to - DAY), to) });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Internal error' });
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
const broadcast = (now) => {
  if (!wss.clients.size) return;
  const msg = JSON.stringify({ type: 'snapshot', data: buildSnapshot(now) });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
};
wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'snapshot', data: buildSnapshot(Date.now()) })));

captureFrozen(Date.now(), faultsAt(Date.now()));
setInterval(() => {
  const now = Date.now();
  const f = faultsAt(now);
  trackFaults(now, f);
  advanceMinutes(now, f);
  captureFrozen(now, f);
  broadcast(now);
}, 2000);

server.listen(PORT, () => {
  console.log(`Mock rice-mill API (SIMULATED DATA) on http://localhost:${PORT}  [faults ${FAULTS ? 'ON' : 'off'}, tz +${TZ_MIN} min]`);
});
