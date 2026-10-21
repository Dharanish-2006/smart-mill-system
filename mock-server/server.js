// DEVELOPMENT-ONLY mock of the REST API + WebSocket the dashboard expects (see docs/API.md).
// The simulation itself lives in engine.js (shared with the static demo build).
//
//   npm run mock                    -> http://localhost:4000
//   MOCK_FAULTS=0 npm run mock      -> no scripted faults
//   MOCK_TZ_OFFSET_MIN=330 ...      -> plant timezone offset from UTC (default 330 = IST)

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { FAULTS, TZ_MIN, buildSnapshot, handle, tick } from './engine.js';

const PORT = Number(process.env.PORT || 4000);

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed (this API is read-only)' });
  try {
    const url = new URL(req.url, 'http://localhost');
    const { status, body } = handle(url.pathname, url.searchParams);
    return send(res, status, body);
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

setInterval(() => {
  const now = Date.now();
  tick(now);
  broadcast(now);
}, 2000);

server.listen(PORT, () => {
  console.log(`Mock rice-mill API (SIMULATED DATA) on http://localhost:${PORT}  [faults ${FAULTS ? 'ON' : 'off'}, tz +${TZ_MIN} min]`);
});
