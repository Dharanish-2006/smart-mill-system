import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { MOTORS, MOTOR_BY_ID } from '../config/motors.js';
import { describeError, getLive } from '../services/api.js';
import { deriveGateways, deriveMotor } from '../utils/status.js';
import { computeSummary } from '../utils/aggregates.js';
import { deriveAlerts } from '../utils/alerts.js';
import { useThresholds } from '../hooks/useThresholds.js';

const POLL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 5000;
const WS_URL = import.meta.env.VITE_WS_URL || '';
const TICK_MS = 2000;

const LiveDataContext = createContext(null);
export const useLiveData = () => useContext(LiveDataContext);

function resolveWsUrl(url) {
  if (!url) return '';
  if (url.startsWith('/')) return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${url}`;
  return url;
}

export function LiveDataProvider({ children }) {
  const { thresholds, setThresholds, resetThresholds } = useThresholds();
  const [snapshot, setSnapshot] = useState(null);
  const [conn, setConn] = useState({ api: 'connecting', transport: 'polling', lastOkAt: null, error: null });
  const [tick, setTick] = useState(0);
  const skewRef = useRef(0); // server clock - browser clock, so staleness is not skewed by a wrong PC clock
  const wsUpRef = useRef(false);
  const sinceRef = useRef(new Map());

  const applySnapshot = useCallback((data) => {
    if (!data || !Array.isArray(data.motors)) {
      setConn((c) => ({ ...c, api: 'error', error: 'The API returned an unexpected live-data format' }));
      return;
    }
    const serverTime = Date.parse(data.serverTime);
    if (Number.isFinite(serverTime)) skewRef.current = serverTime - Date.now();
    setSnapshot(data);
    setConn((c) => ({ ...c, api: 'ok', error: null, lastOkAt: Date.now() }));
  }, []);

  // Polling (always on; slows down while the WebSocket is healthy)
  useEffect(() => {
    let stopped = false;
    let timer;
    const ctrl = new AbortController();
    async function poll() {
      try {
        applyIfActive(await getLive(ctrl.signal));
      } catch (e) {
        if (!stopped && !axios.isCancel(e)) {
          setConn((c) => ({ ...c, api: 'error', error: describeError(e) }));
        }
      }
      if (!stopped) timer = setTimeout(poll, wsUpRef.current ? 30000 : POLL_MS);
    }
    function applyIfActive(data) {
      if (!stopped) applySnapshot(data);
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [applySnapshot]);

  // Optional WebSocket push
  useEffect(() => {
    const url = resolveWsUrl(WS_URL);
    if (!url || typeof WebSocket === 'undefined') return undefined;
    let closed = false;
    let ws;
    let retry = 0;
    let timer;
    function connect() {
      ws = new WebSocket(url);
      ws.onopen = () => {
        if (closed) return;
        retry = 0;
        wsUpRef.current = true;
        setConn((c) => ({ ...c, transport: 'websocket' }));
      };
      ws.onmessage = (ev) => {
        if (closed) return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === 'snapshot') applySnapshot(msg.data);
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (closed) return;
        wsUpRef.current = false;
        setConn((c) => ({ ...c, transport: 'polling' }));
        timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
      };
    }
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      if (ws) ws.close();
    };
  }, [applySnapshot]);

  // Re-evaluate staleness even when no new data arrives
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const value = useMemo(() => {
    const nowMs = Date.now() + skewRef.current;
    const gateways = deriveGateways(snapshot?.gateways, nowMs, thresholds);
    const rawById = new Map((snapshot?.motors || []).map((r) => [r?.motorId, r]));
    const motors = MOTORS.map((cfg) => deriveMotor(cfg, rawById.get(cfg.id), gateways, nowMs, thresholds));
    const summary = computeSummary(motors);

    let alerts = [];
    if (snapshot) {
      const seen = new Set();
      alerts = deriveAlerts(motors, thresholds).map((a) => {
        seen.add(a.key);
        if (!sinceRef.current.has(a.key)) sinceRef.current.set(a.key, nowMs);
        return { ...a, timestamp: sinceRef.current.get(a.key) };
      });
      for (const k of [...sinceRef.current.keys()]) if (!seen.has(k)) sinceRef.current.delete(k);
    }

    const gatewayList = [...gateways.values()].map((g) => ({
      ...g,
      motorIds: motors.filter((d) => d.gatewayId === g.id).map((d) => d.motorId),
    }));

    return {
      loaded: !!snapshot,
      conn,
      nowMs,
      source: snapshot?.meta?.source ?? null,
      motors,
      motorById: Object.fromEntries(motors.map((d) => [d.motorId, d])),
      gateways: gatewayList,
      summary,
      alerts,
      thresholds,
      setThresholds,
      resetThresholds,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, thresholds, conn, tick]);

  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
}

export { MOTOR_BY_ID };
