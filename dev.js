// Starts the Express API (port 5050) and the Vite React dev server (port 5280) together.
import { spawn } from 'node:child_process';

const node = process.execPath;
const webPort = process.env.PORT || '5280';
const env = { ...process.env, API_PORT: '5050' };
const procs = [
  spawn(node, ['--watch-path=server', 'server/index.js'], { stdio: 'inherit', env }),
  spawn(node, ['node_modules/vite/bin/vite.js', '--port', webPort, '--strictPort'], { stdio: 'inherit' }),
];
const stop = () => { procs.forEach((p) => p.kill()); process.exit(); };
procs.forEach((p) => p.on('exit', (code) => code && stop()));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
