import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, rawMotor, gws, NOW, TH } from './helpers.js';

test('healthy motor with current is RUNNING with live values', () => {
  const d = derive(rawMotor());
  assert.equal(d.status, 'RUNNING');
  assert.equal(d.comm.state, 'OK');
  assert.equal(d.m.activePowerKw, 6.2);
});

test('near-zero current with healthy comms is STOPPED', () => {
  const d = derive(rawMotor({ measurements: { ...rawMotor().measurements, avgCurrentA: 0, activePowerKw: 0 } }));
  assert.equal(d.status, 'STOPPED');
  assert.equal(d.m.activePowerKw, 0); // a real zero stays zero
  assert.equal(d.run.durationMinutes, null);
});

test('Modbus failure gives UNKNOWN (never STOPPED) and N/A values', () => {
  const d = derive(rawMotor({ commStatus: 'TIMEOUT', measurements: null }));
  assert.equal(d.status, 'UNKNOWN');
  assert.equal(d.comm.state, 'MODBUS_ERROR');
  assert.equal(d.m.activePowerKw, null);
  assert.equal(d.m.avgCurrentA, null);
});

test('a comm failure hides stale values even if the payload still carries them', () => {
  const d = derive(rawMotor({ commStatus: 'ERROR' }));
  assert.equal(d.status, 'UNKNOWN');
  assert.equal(d.m.activeEnergyKwh, null);
  assert.equal(d.lastKnown.activeEnergyKwh, 5000);
});

test('stale reading gives UNKNOWN', () => {
  const d = derive(rawMotor({ lastReadingAt: new Date(NOW - 10 * 60000).toISOString() }));
  assert.equal(d.comm.state, 'STALE');
  assert.equal(d.status, 'UNKNOWN');
});

test('gateway offline gives UNKNOWN for its motors', () => {
  const g = gws([{ id: 'GW-1', name: 'Gateway 1', online: false, lastSeenAt: new Date(NOW - 1000).toISOString() }]);
  const d = derive(rawMotor(), undefined, g);
  assert.equal(d.comm.state, 'GATEWAY_OFFLINE');
  assert.equal(d.status, 'UNKNOWN');
});

test('gateway with an old heartbeat counts as offline', () => {
  const g = gws([{ id: 'GW-1', name: 'Gateway 1', online: true, lastSeenAt: new Date(NOW - 600000).toISOString() }]);
  assert.equal(g.get('GW-1').online, false);
});

test('missing motor entry gives UNKNOWN / NO_DATA', () => {
  const d = derive(undefined);
  assert.equal(d.status, 'UNKNOWN');
  assert.equal(d.comm.state, 'NO_DATA');
});

test('out-of-range power factor becomes null and raises an issue, status unaffected', () => {
  const d = derive(rawMotor({ measurements: { ...rawMotor().measurements, powerFactor: 1.35 } }));
  assert.equal(d.m.powerFactor, null);
  assert.equal(d.status, 'RUNNING');
  assert.ok(d.issues.some((i) => i.field === 'powerFactor'));
});

test('numeric strings (PostgreSQL NUMERIC) are accepted; garbage is rejected', () => {
  const d = derive(rawMotor({ measurements: { ...rawMotor().measurements, activePowerKw: '6.25', avgCurrentA: 'abc' } }));
  assert.equal(d.m.activePowerKw, 6.25);
  assert.equal(d.m.avgCurrentA, null);
  assert.ok(d.issues.some((i) => i.field === 'avgCurrentA'));
});

test('invalid current falls back to the gateway-reported state', () => {
  const d = derive(rawMotor({ measurements: { ...rawMotor().measurements, avgCurrentA: null }, run: { state: 'RUNNING' } }));
  assert.equal(d.status, 'RUNNING');
  const e = derive(rawMotor({ measurements: { ...rawMotor().measurements, avgCurrentA: null }, run: {} }));
  assert.equal(e.status, 'UNKNOWN');
});

test('current-run values only exist while RUNNING', () => {
  const d = derive(rawMotor());
  assert.equal(d.run.durationMinutes, 60);
  assert.equal(d.run.energyKwh, 6);
});

test('custom run-current threshold is honoured', () => {
  const raw = rawMotor({ measurements: { ...rawMotor().measurements, avgCurrentA: 1.0 } });
  assert.equal(derive(raw).status, 'RUNNING');
  assert.equal(derive(raw, undefined, undefined, { ...TH, runCurrentA: 2 }).status, 'STOPPED');
});
