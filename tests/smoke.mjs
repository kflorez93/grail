import { execSync, spawn } from 'node:child_process';

function ensureDaemon() {
  let ok = false;
  try {
    const out = execSync('node ./cli/src/index.js health', { stdio: 'pipe', encoding: 'utf8' });
    ok = /\"ok\"|\"status\":\s*\"ok\"/i.test(out) || out.includes('ok');
  } catch (_) { ok = false; }
  if (ok) return;
  const child = spawn('node', ['./daemon/src/index.js'], { stdio: 'ignore', detached: true });
  child.unref();
  for (let i = 0; i < 20; i += 1) {
    try {
      const out = execSync('node ./cli/src/index.js health', { stdio: 'pipe', encoding: 'utf8' });
      if (/\"ok\"|\"status\":\s*\"ok\"/i.test(out) || out.includes('ok')) { ok = true; break; }
    } catch (_) {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  if (!ok) throw new Error('Daemon failed to start');
}

function run(cmd) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
}

ensureDaemon();
const health = JSON.parse(run('node ./cli/src/index.js health'));
if (health.status !== 'ok') throw new Error('Health not ok');

const out = JSON.parse(run('node ./cli/src/index.js docs "nextjs static generation" --site vercel.com --n 1'));
if (!out.bundle_json) throw new Error('No bundle_json');

console.log('OK');
