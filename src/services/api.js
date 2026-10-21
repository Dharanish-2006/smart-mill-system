import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

export const http = axios.create({ baseURL, timeout: 15000 });

export function describeError(e) {
  if (axios.isAxiosError(e)) {
    if (e.response) return `API returned ${e.response.status}${e.response.statusText ? ` ${e.response.statusText}` : ''}`;
    if (e.code === 'ECONNABORTED') return 'The API request timed out';
    // return 'Cannot reach the API';
  }
  // return e?.message || 'Unknown error';
}

const get = (url, params, signal) => http.get(url, { params, signal }).then((r) => r.data);

// Live snapshot of all motors + gateways (see docs/API.md)
export const getLive = (signal) => get('/motors/live', undefined, signal);

// range: 1h | 24h | 7d | 30d
export const getMotorHistory = (motorId, range, signal) =>
  get(`/motors/${encodeURIComponent(motorId)}/history`, { range }, signal);

// from/to are ISO timestamps
export const getReport = (from, to, signal) => get('/reports', { from, to }, signal);

// motorId optional ("all" when omitted)
export const getReadings = (from, to, motorId, signal) =>
  get('/readings', { from, to, ...(motorId && motorId !== 'all' ? { motorId } : {}) }, signal);

export const getAlertEvents = (from, to, signal) => get('/alerts/events', { from, to }, signal);
