// Fan-data storage. Uses Upstash Redis when it is configured (Vercel → Storage → Upstash for Redis
// sets KV_REST_API_URL / KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL / _TOKEN); otherwise null,
// and the server keeps using the local data/ folder.
import fs from 'node:fs';
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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
