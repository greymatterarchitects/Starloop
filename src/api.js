import { useEffect, useState, useCallback } from 'react';

/** Fetch JSON from the StarLoop API and refresh it periodically (live data). */
export function useApi(path, refreshMs = 5 * 60_000) {
  const [state, setState] = useState({ data: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const load = () =>
      fetch(path)
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || r.statusText);
          return j;
        })
        .then((data) => alive && setState({ data, loading: false, error: null }))
        .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e.message })));
    setState({ data: null, loading: true, error: null });
    load();
    const t = setInterval(load, refreshMs);
    return () => { alive = false; clearInterval(t); };
  }, [path, refreshMs]);
  return state;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function useLocal(key, initial) {
  const [v, setV] = useState(() => {
    try { const x = localStorage.getItem(key); return x == null ? initial : JSON.parse(x); } catch { return initial; }
  });
  const set = useCallback((nv) => setV((old) => {
    const val = typeof nv === 'function' ? nv(old) : nv;
    localStorage.setItem(key, JSON.stringify(val));
    return val;
  }), [key]);
  return [v, set];
}

export const INDUSTRY_CHIPS = [
  ['tollywood', 'Tollywood'], ['hollywood', 'Hollywood'], ['kollywood', 'Kollywood'],
  ['bollywood', 'Bollywood'], ['sandalwood', 'Sandalwood'], ['mollywood', 'Mollywood'],
];

/* Stories you've opened recently (ring dims, like any story app). Stored in this browser only. */
const SEEN_KEY = 'starloop:seen';
const SEEN_TTL = 6 * 3600_000;
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch { return {}; } };
export function markSeen(id) {
  if (!id) return;
  const s = readSeen();
  s[id] = Date.now();
  localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event('starloop:seen'));
}
export function useSeen() {
  const [seen, setSeen] = useState(readSeen);
  useEffect(() => {
    const h = () => setSeen(readSeen());
    window.addEventListener('starloop:seen', h);
    return () => window.removeEventListener('starloop:seen', h);
  }, []);
  return (id) => !!seen[id] && Date.now() - seen[id] < SEEN_TTL;
}
