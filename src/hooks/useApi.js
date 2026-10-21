import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { describeError } from '../services/api.js';

/**
 * Fetch helper with abort-on-change, optional auto-refresh and manual reload.
 * `fetcher(signal)` must return a promise. Data resets to null when `deps` change so a page
 * never shows another motor's / range's data under the wrong heading.
 */
export function useApi(fetcher, deps, { refreshMs } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const ctrl = new AbortController();
    let timer;

    async function run(initial) {
      if (initial) setState({ data: null, error: null, loading: true });
      try {
        const data = await fetcherRef.current(ctrl.signal);
        if (ctrl.signal.aborted) return;
        setState({ data, error: null, loading: false });
      } catch (e) {
        if (ctrl.signal.aborted || axios.isCancel(e)) return;
        setState((s) => ({ data: s.data, error: describeError(e), loading: false }));
      }
      if (refreshMs && !ctrl.signal.aborted) timer = setTimeout(() => run(false), refreshMs);
    }
    run(true);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshMs, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
