import { useCallback, useEffect, useState } from 'react';

/* Signed-in fan session (token from email + password login), shared across the app. */
const KEY = 'starloop:session';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const listeners = new Set();
let session = read();
function setSession(s) {
  session = s;
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l(s));
}
window.addEventListener('storage', (e) => { if (e.key === KEY) { session = read(); listeners.forEach((l) => l(session)); } });

export function authHeaders() {
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
}

export async function fanPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && session) setSession(null);
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
}

export async function fanGet(url) {
  const r = await fetch(url, { headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
}

export function useFan() {
  const [s, set] = useState(session);
  useEffect(() => { listeners.add(set); return () => listeners.delete(set); }, []);
  const signup = useCallback(async (email, password, name) => {
    const r = await fanPost('/api/fans/auth/signup', { email, password, name });
    setSession({ token: r.token, user: r.user });
  }, []);
  const login = useCallback(async (email, password) => {
    const r = await fanPost('/api/fans/auth/login', { email, password });
    setSession({ token: r.token, user: r.user });
  }, []);
  const logout = useCallback(async () => {
    await fanPost('/api/fans/auth/logout').catch(() => {});
    setSession(null);
  }, []);
  const updateMe = useCallback(async (fields) => {
    const u = await fanPost('/api/fans/me', fields);
    setSession({ ...session, user: u });
    return u;
  }, []);
  return {
    id: s?.user?.id || null,
    me: s?.user || { name: '' },
    registered: !!s?.token,
    signup, login, logout, updateMe,
  };
}

export function readImage(file, max = 1600) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}
