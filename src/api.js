import { useEffect, useState, useCallback } from 'react';

/* Last good response per URL, kept in this browser so pages render instantly on the next visit
   while fresh data loads in the background (stale-while-revalidate). */
const CACHE_PREFIX = 'starloop:cache:';
const CACHE_MAX_AGE = 24 * 3600_000;
export function readCache(key) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_PREFIX + key));
    return c && Date.now() - c.at < CACHE_MAX_AGE ? c.data : null;
  } catch { return null; }
}
export function writeCache(key, data) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data })); }
  catch { // storage full: drop old entries and try once more
    Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k));
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data })); } catch {}
  }
}

/** Fetch JSON from the StarLoop API and refresh it periodically (live data). Shows cached data instantly. */
export function useApi(path, refreshMs = 5 * 60_000) {
  const [state, setState] = useState(() => {
    const cached = path ? readCache(path) : null;
    return { data: cached, loading: !!path, error: null, stale: !!cached };
  });
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
        .then((data) => { writeCache(path, data); if (alive) setState({ data, loading: false, error: null, stale: false }); })
        .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: s.data ? null : e.message })));
    const cached = readCache(path);
    setState({ data: cached, loading: true, error: null, stale: !!cached });
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
