import { limitsFor } from './status.js';

// Severity colours: critical = red, warning = amber (incl. communication), info = neutral.
export const ALERT_TYPES = {
  MODBUS_FAILURE: { label: 'Modbus communication failure', category: 'Communication', severity: 'warning' },
  GATEWAY_OFFLINE: { label: 'Gateway offline', category: 'Communication', severity: 'warning' },
  STALE_READING: { label: 'Stale meter reading', category: 'Communication', severity: 'warning' },
  UNEXPECTED_DATA: { label: 'Unexpected meter data', category: 'Data quality', severity: 'warning' },
  HIGH_CURRENT: { label: 'High current', category: 'Electrical', severity: 'critical' },
  HIGH_POWER: { label: 'High power', category: 'Electrical', severity: 'warning' },
  LOW_POWER_FACTOR: { label: 'Low power factor', category: 'Electrical', severity: 'warning' },
  STATUS_CHANGE: { label: 'Motor status change', category: 'Status', severity: 'info' },
  RECOVERED: { label: 'Communication restored', category: 'Communication', severity: 'info' },
};

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };
const motorNumber = (id) => Number(String(id).replace(/\D/g, '')) || 0;

export const alertLabel = (type) => ALERT_TYPES[type]?.label || String(type || 'Alert');
export const alertCategory = (type) => ALERT_TYPES[type]?.category || 'Other';

/** Critical first, then warning, then info; ties by motor number. */
export function sortAlerts(list) {
  return [...list].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || motorNumber(a.motorId) - motorNumber(b.motorId),
  );
}

/**
 * Alerts that are active right now, derived from the live motor state.
 * A communication problem raises only a communication alert: the motor is UNKNOWN, never "stopped",
 * and electrical threshold alerts are not evaluated on data that cannot be trusted.
 */
export function deriveAlerts(motors, th) {
  const out = [];
  const add = (d, type, description) =>
    out.push({
      key: `${type}:${d.motorId}`,
      type,
      severity: ALERT_TYPES[type].severity,
      motorId: d.motorId,
      machineName: d.name,
      description,
    });

  for (const d of motors) {
    if (!d.comm.ok) {
      const type =
        d.comm.state === 'GATEWAY_OFFLINE' ? 'GATEWAY_OFFLINE' : d.comm.state === 'MODBUS_ERROR' ? 'MODBUS_FAILURE' : 'STALE_READING';
      add(d, type, `${d.comm.message}. Operating status is UNKNOWN until communication is restored.`);
      continue;
    }
    if (d.issues.length) add(d, 'UNEXPECTED_DATA', d.issues.map((i) => i.message).join('; '));
    if (d.status !== 'RUNNING') continue;

    const lim = limitsFor(th, d.motorId);
    if (d.m.avgCurrentA != null && d.m.avgCurrentA > lim.highCurrentA) {
      add(d, 'HIGH_CURRENT', `Average current ${d.m.avgCurrentA.toFixed(1)} A exceeds the ${lim.highCurrentA} A limit`);
    }
    if (d.m.activePowerKw != null && d.m.activePowerKw > lim.highPowerKw) {
      add(d, 'HIGH_POWER', `Active power ${d.m.activePowerKw.toFixed(2)} kW exceeds the ${lim.highPowerKw} kW limit`);
    }
    if (d.m.powerFactor != null && Math.abs(d.m.powerFactor) < th.lowPowerFactor) {
      add(d, 'LOW_POWER_FACTOR', `Power factor ${Math.abs(d.m.powerFactor).toFixed(3)} is below ${th.lowPowerFactor} while running`);
    }
  }
  return sortAlerts(out);
}
