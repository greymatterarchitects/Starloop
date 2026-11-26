import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Where fan data, uploads and caches live. Vercel's filesystem is read-only except /tmp.
export const DATA_DIR = process.env.STARLOOP_DATA_DIR
  || (process.env.VERCEL ? '/tmp/starloop-data' : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'));
