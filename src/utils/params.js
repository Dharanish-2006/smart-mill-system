import { NA, fmtDateTime, fmtDuration, fmtNum, fmtUnit } from './format.js';

/**
 * The 18 required parameters for one motor, as display rows.
 * Unavailable values are "N/A" (never 0). Current-run values only apply while RUNNING.
 */
export function buildParameterRows(d) {
  const m = d.m;
  const run = d.run;
  const whileRunning = (fn) => (d.status === 'RUNNING' ? fn() : d.status === 'STOPPED' ? 'Not running' : NA);
  return [
    { n: 1, group: 'Electrical measurements', label: 'Average Current', text: fmtUnit(m.avgCurrentA, 2, 'A') },
    { n: 2, group: 'Electrical measurements', label: 'Power Factor', text: fmtNum(m.powerFactor, 3) },
    { n: 3, group: 'Electrical measurements', label: 'Active Power', text: fmtUnit(m.activePowerKw, 2, 'kW') },
    { n: 4, group: 'Electrical measurements', label: 'Reactive Power', text: fmtUnit(m.reactivePowerKvar, 2, 'kVAR') },
    { n: 5, group: 'Electrical measurements', label: 'Apparent Power', text: fmtUnit(m.apparentPowerKva, 2, 'kVA') },
    { n: 6, group: 'Electrical measurements', label: 'Total Runtime', text: fmtDuration(m.runtimeMinutes) },
    { n: 7, group: 'Electrical measurements', label: 'Total Active Energy', text: fmtUnit(m.activeEnergyKwh, 1, 'kWh') },
    { n: 8, group: 'Electrical measurements', label: 'Total Reactive Energy', text: fmtUnit(m.reactiveEnergyKvarh, 1, 'kVARh') },
    { n: 9, group: 'Electrical measurements', label: 'Total Apparent Energy', text: fmtUnit(m.apparentEnergyKvah, 1, 'kVAh') },
    { n: 10, group: 'Electrical measurements', label: 'Maximum Demand', text: fmtUnit(m.maxDemandKw, 2, 'kW') },
    { n: 11, group: 'Electrical measurements', label: 'Load Factor', text: fmtUnit(m.loadFactorPct, 1, '%') },
    { n: 12, group: 'Motor information & operating statistics', label: 'Motor Name', text: `${d.name} (${d.motorId})` },
    { n: 13, group: 'Motor information & operating statistics', label: 'Motor ON Time', text: fmtDateTime(run.onTime) },
    { n: 14, group: 'Motor information & operating statistics', label: 'Motor OFF Time', text: fmtDateTime(run.offTime) },
    { n: 15, group: 'Motor information & operating statistics', label: 'Running Duration (current run)', text: whileRunning(() => fmtDuration(run.durationMinutes)) },
    { n: 16, group: 'Motor information & operating statistics', label: 'Energy Used (current run)', text: whileRunning(() => fmtUnit(run.energyKwh, 2, 'kWh')) },
    { n: 17, group: 'Motor information & operating statistics', label: 'Average Power Factor (current run)', text: whileRunning(() => fmtNum(run.avgPowerFactor, 3)) },
    { n: 18, group: 'Motor information & operating statistics', label: 'Motor Status', text: d.status },
  ];
}

/** Text for a current-run cell in compact tables. */
export const runCell = (d, text) => (d.status === 'RUNNING' ? text : d.status === 'STOPPED' ? 'Not running' : NA);
