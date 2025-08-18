import { execSync } from 'node:child_process';

function run(cmd) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
}

const health = JSON.parse(run('node ./cli/src/index.js health'));
if (health.status !== 'ok') throw new Error('Health not ok');

const out = JSON.parse(run('node ./cli/src/index.js docs "nextjs static generation" --site vercel.com --n 1'));
if (!out.bundle_json) throw new Error('No bundle_json');

console.log('OK');
