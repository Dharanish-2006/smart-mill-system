import { deriveGateways, deriveMotor, DEFAULT_THRESHOLDS } from '../src/utils/status.js';

export const NOW = Date.parse('2026-10-21T06:00:00Z');
export const TH = { ...DEFAULT_THRESHOLDS };
export const cfg = (id = 'M1', name = 'Receiving Hopper') => ({ id, name, sectionId: 'S1' });

export const rawMotor = (over = {}) => ({
  motorId: 'M1', slaveId: 1, gatewayId: 'GW-1', meterModel: 'SELEC MFM384',
  lastReadingAt: new Date(NOW - 5000).toISOString(), commStatus: 'OK',
  measurements: {
    avgCurrentA: 12.5, powerFactor: 0.86, activePowerKw: 6.2, reactivePowerKvar: 3.6,
    apparentPowerKva: 7.2, runtimeMinutes: 1000, activeEnergyKwh: 5000, reactiveEnergyKvarh: 2000,
    apparentEnergyKvah: 5800, maxDemandKw: 7, loadFactorPct: 60,
  },
  run: { onTime: new Date(NOW - 3600000).toISOString(), offTime: new Date(NOW - 7200000).toISOString(), durationMinutes: 60, energyKwh: 6, avgPowerFactor: 0.85 },
  ...over,
});

export const gws = (list = [{ id: 'GW-1', name: 'Gateway 1', online: true, lastSeenAt: new Date(NOW - 2000).toISOString() }]) =>
  deriveGateways(list, NOW, TH);

export const derive = (raw, c = cfg(), gateways = gws(), th = TH) => deriveMotor(c, raw, gateways, NOW, th);
