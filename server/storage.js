// Fan-data storage. Uses Upstash Redis when it is configured (Vercel → Storage → Upstash for Redis
// sets KV_REST_API_URL / KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL / _TOKEN); otherwise null,
// and the server keeps using the local data/ folder.
import fs from 'node:fs';
import { Redis } from '@upstash/redis';

// Accept the standard names, or any custom prefix Vercel's integration may add (e.g. STORAGE_KV_REST_API_URL).
const pick = (suffixes) => {
  for (const sfx of suffixes) {
    if (process.env[sfx]) return process.env[sfx];
    const k = Object.keys(process.env).find((n) => n.endsWith(`_${sfx}`) && process.env[n]);
    if (k) return process.env[k];
  }
  return undefined;
};
const url = pick(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']);
const token = pick(['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN']);
/** Names (never values) of storage-related settings present, for troubleshooting. */
export const storageEnvNames = Object.keys(process.env).filter((n) => /KV_|REDIS|UPSTASH/i.test(n)).sort();

/** Tiny file-backed stand-in with the same calls, for testing the Redis code path locally. */
function fakeRedis(file) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const write = (o) => fs.writeFileSync(file, JSON.stringify(o));
  return {
    async get(k) { return read()[k] ?? null; },
    async set(k, v) { const o = read(); o[k] = v; write(o); return 'OK'; },
    async mset(obj) { const o = { ...read(), ...obj }; write(o); return 'OK'; },
  };
}

export const redis = process.env.STARLOOP_FAKE_REDIS_FILE
  ? fakeRedis(process.env.STARLOOP_FAKE_REDIS_FILE)
  : url && token ? new Redis({ url, token }) : null;

export const storageKind = redis ? (process.env.STARLOOP_FAKE_REDIS_FILE ? 'fake-redis' : 'redis') : 'file';
