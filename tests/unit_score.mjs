import { readFileSync } from 'node:fs';

const src = readFileSync('./cli/src/index.js', 'utf8');

// Extract the scoreHeuristics function text and eval in a sandbox
const match = src.match(/function scoreHeuristics\([\s\S]*?\n\}/);
if (!match) throw new Error('scoreHeuristics missing');
// eslint-disable-next-line no-new-func
const fn = new Function(`${match[0]}; return scoreHeuristics;`)();

const good = fn('https://docs.example.com/docs/getting-started');
const bad = fn('https://example.com/blog/old');
if (!(good > bad)) throw new Error('heuristics ranking not as expected');

console.log('unit_score OK');


