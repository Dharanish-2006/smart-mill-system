import { useCallback, useState } from 'react';
import { DEFAULT_THRESHOLDS } from '../utils/status.js';

const KEY = 'ricemill.thresholds.v1';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return { ...DEFAULT_THRESHOLDS, ...saved, motorOverrides: { ...(saved.motorOverrides || {}) } };
    }
  } catch {
    /* storage blocked or corrupt: fall back to defaults */
  }
  return { ...DEFAULT_THRESHOLDS };
}

/** Alert thresholds, kept in this browser (per-viewer). */
export function useThresholds() {
  const [thresholds, setState] = useState(load);

  const setThresholds = useCallback((next) => {
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const resetThresholds = useCallback(() => {
    setState({ ...DEFAULT_THRESHOLDS });
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { thresholds, setThresholds, resetThresholds };
}
