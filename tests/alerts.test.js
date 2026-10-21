import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAlerts } from '../src/utils/alerts.js';
import { derive, rawMotor, cfg, gws, TH } from './helpers.js';

const m = (id, over, th) => derive(rawMotor({ motorId: id, ...over }), cfg(id, `Motor ${id}`), undefined, th);
const types = (list) => list.map((a) => a.type);

test('communication failures produce comm alerts only, with motor id and name', () => {
  const a = deriveAlerts([m('M3', { commStatus: 'TIMEOUT', measurements: null })], TH);
  assert.deepEqual(types(a), ['MODBUS_FAILURE']);
  assert.equal(a[0].motorId, 'M3');
  assert.equal(a[0].machineName, 'Motor M3');
  assert.equal(a[0].severity, 'warning');
  assert.match(a[0].description, /UNKNOWN/);
});

test('gateway offline is reported per motor', () => {
  const g = gws([{ id: 'GW-1', name: 'Gateway 1', online: false }]);
  const d = derive(rawMotor(), cfg(), g);
  assert.deepEqual(types(deriveAlerts([d], TH)), ['GATEWAY_OFFLINE']);
});

test('threshold alerts respect configurable global limits', () => {
  const hot = m('M1', { measurements: { ...rawMotor().measurements, avgCurrentA: 65, activePowerKw: 38, apparentPowerKva: 50, powerFactor: 0.7 } });
  assert.deepEqual(types(deriveAlerts([hot], TH)).sort(), ['HIGH_CURRENT', 'HIGH_POWER', 'LOW_POWER_FACTOR']);
  const relaxed = { ...TH, highCurrentA: 90, highPowerKw: 60, lowPowerFactor: 0.6 };
  assert.deepEqual(deriveAlerts([hot], relaxed), []);
});

test('per-motor overrides beat global limits', () => {
  const hot = m('M1', { measurements: { ...rawMotor().measurements, avgCurrentA: 65 } });
  const th = { ...TH, motorOverrides: { M1: { highCurrentA: 70 } } };
  assert.ok(!types(deriveAlerts([hot], th)).includes('HIGH_CURRENT'));
});

test('unexpected data raises an alert', () => {
  const d = m('M4', { measurements: { ...rawMotor().measurements, powerFactor: 1.35 } });
  const a = deriveAlerts([d], TH);
  assert.ok(types(a).includes('UNEXPECTED_DATA'));
});

test('stopped motors never raise electrical alerts; critical sorts first', () => {
  const stopped = m('M2', { measurements: { ...rawMotor().measurements, avgCurrentA: 0, powerFactor: 0, activePowerKw: 0 } });
  assert.deepEqual(deriveAlerts([stopped], TH), []);
  const hot = m('M5', { measurements: { ...rawMotor().measurements, avgCurrentA: 99 } });
  const comm = m('M1', { commStatus: 'ERROR' });
  assert.equal(deriveAlerts([comm, hot], TH)[0].severity, 'critical');
});
