import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSummary } from '../src/utils/aggregates.js';
import { derive, rawMotor, cfg } from './helpers.js';

const motor = (id, over) => derive(rawMotor({ motorId: id, ...over }), cfg(id, `Motor ${id}`));

test('totals exclude unavailable meters and report how many were included', () => {
  const list = [
    motor('M1', {}),
    motor('M2', {}),
    motor('M3', { commStatus: 'TIMEOUT', measurements: null }),
  ];
  const s = computeSummary(list);
  assert.equal(s.totalMotors, 3);
  assert.equal(s.running, 2);
  assert.equal(s.unknown, 1);
  assert.equal(s.stopped, 0);
  assert.equal(s.commErrors, 1);
  assert.equal(s.power.included, 2);
  assert.ok(Math.abs(s.power.value - 12.4) < 1e-9);
  assert.equal(s.energy.value, 10000);
});

test('an invalid single field is excluded from only that figure', () => {
  const bad = motor('M2', { measurements: { ...rawMotor().measurements, activePowerKw: -5 } });
  const s = computeSummary([motor('M1', {}), bad]);
  assert.equal(s.power.included, 1);
  assert.equal(s.energy.included, 2);
});

test('no valid data gives null (N/A), never 0', () => {
  const s = computeSummary([motor('M1', { commStatus: 'ERROR' })]);
  assert.equal(s.power.value, null);
  assert.equal(s.energy.value, null);
  assert.equal(s.pf.value, null);
});

test('average power factor covers running motors only', () => {
  const stopped = motor('M2', { measurements: { ...rawMotor().measurements, avgCurrentA: 0, powerFactor: 0, activePowerKw: 0 } });
  const s = computeSummary([motor('M1', {}), stopped]);
  assert.equal(s.stopped, 1);
  assert.equal(s.pf.included, 1);
  assert.equal(s.pf.value, 0.86);
});
