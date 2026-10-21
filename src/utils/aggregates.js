/**
 * Plant-wide summary from derived motors (see status.js).
 *
 * Totals use only meters whose communication is healthy AND whose individual field is valid.
 * Nothing is replaced by zero: when no meter contributes, `value` is null (shown as N/A).
 * `included` / `of` say how many meters contributed out of how many exist.
 */
const total = (motors, pick) => {
  let sum = 0;
  let included = 0;
  for (const d of motors) {
    const v = d.comm.ok ? pick(d) : null;
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v;
      included += 1;
    }
  }
  return { value: included ? sum : null, included, of: motors.length };
};

export function computeSummary(motors) {
  const running = motors.filter((d) => d.status === 'RUNNING');

  // Power factor is only meaningful while a motor is loaded, so average over RUNNING motors.
  let pfSum = 0;
  let pfCount = 0;
  for (const d of running) {
    const pf = d.m.powerFactor;
    if (typeof pf === 'number' && Number.isFinite(pf)) {
      pfSum += Math.abs(pf);
      pfCount += 1;
    }
  }

  return {
    totalMotors: motors.length,
    running: running.length,
    stopped: motors.filter((d) => d.status === 'STOPPED').length,
    unknown: motors.filter((d) => d.status === 'UNKNOWN').length,
    commErrors: motors.filter((d) => !d.comm.ok).length,
    power: total(motors, (d) => d.m.activePowerKw),
    energy: total(motors, (d) => d.m.activeEnergyKwh),
    runtime: total(motors, (d) => d.m.runtimeMinutes),
    pf: { value: pfCount ? pfSum / pfCount : null, included: pfCount, of: running.length },
  };
}
