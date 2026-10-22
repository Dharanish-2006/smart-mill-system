import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

export const http = axios.create({ baseURL, timeout: 15000 });

export function describeError(e) {
  if (axios.isAxiosError(e)) {
    if (e.response) return `API returned ${e.response.status}${e.response.statusText ? ` ${e.response.statusText}` : ''}`;
    if (e.code === 'ECONNABORTED') return 'The API request timed out';
    return 'Cannot reach the API';
  }
  return e?.message || 'Unknown error';
}

// Static demo mode: switched on by the build mode (`vite build --mode demo`), no .env file needed.
const DEMO = import.meta.env.MODE === 'demo' || import.meta.env.VITE_DEMO === '1';
let enginePromise;
function loadEngine() {
  // Demo plant runs round the clock; add ?faults=0 to the URL to switch off scripted faults.
  globalThis.__MOCK_SHIFT__ ??= '0-24';
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('faults') === '0') {
    globalThis.__MOCK_FAULTS__ = '0';
  }
  enginePromise ??= import('../../mock-server/engine.js').then((engine) => {
    setInterval(() => engine.tick(), 2000);
    return engine;
  });
  return enginePromise;
}

async function demoGet(url, params) {
  const engine = await loadEngine();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null) q.set(k, String(v));
  const { status, body } = engine.handle(`/api${url}`, q);
  if (status >= 400) throw new Error(`API returned ${status}${body?.error ? `: ${body.error}` : ''}`);
  return body;
}

const get = DEMO
  ? (url, params) => demoGet(url, params)
  : (url, params, signal) =>
      http.get(url, { params, signal }).then((r) => {
        // A host that rewrites unknown URLs to index.html answers 200 with a web page instead of JSON.
        if (typeof r.data === 'string') throw new Error('The API URL returned a web page instead of JSON. Check VITE_API_BASE_URL or build with "npm run build:demo".');
        return r.data;
      });

export const getLive = (signal) => get('/motors/live', undefined, signal);

export const getMotorHistory = (motorId, range, signal) =>
  get(`/motors/${encodeURIComponent(motorId)}/history`, { range }, signal);

export const getReport = (from, to, signal) => get('/reports', { from, to }, signal);

export const getReadings = (from, to, motorId, signal) =>
  get('/readings', { from, to, ...(motorId && motorId !== 'all' ? { motorId } : {}) }, signal);

export const getAlertEvents = (from, to, signal) => get('/alerts/events', { from, to }, signal);
