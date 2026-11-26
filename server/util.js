const UA = 'StarLoop/1.0 (local development app)';

export async function getText(url, headers = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Api-User-Agent': UA, ...headers },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

export async function getJson(url, headers = {}) {
  return JSON.parse(await getText(url, { Accept: 'application/json', ...headers }));
}

// Small in-memory cache with in-flight de-duplication. On upstream failure the last good value is served.
const store = new Map();
const inflight = new Map();
export async function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const v = await fn();
      store.set(key, { t: Date.now(), v });
      return v;
    } catch (e) {
      if (hit) return hit.v;
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function limiter(n) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= n || !q.length) return;
    active++;
    const { fn, res, rej } = q.shift();
    fn().then(res, rej).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}

export const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
