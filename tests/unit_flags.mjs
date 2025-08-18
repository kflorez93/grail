import { readFileSync } from 'node:fs';

const src = readFileSync('./cli/src/index.js', 'utf8');

// very basic sanity checks of flag parser behavior via regex presence
if (!/function parseFlags\(/.test(src)) throw new Error('parseFlags missing');
if (!/token\.startsWith\("--"\)/.test(src)) throw new Error('long flag handling missing');
if (!/token\.startsWith\("-"\)/.test(src)) throw new Error('short flag handling missing');

console.log('unit_flags OK');


