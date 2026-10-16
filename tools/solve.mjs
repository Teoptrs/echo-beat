// Level solver: writes par beats and hint routes to src/solutions.json.
// The search itself lives in src/solver.js.
//   node tools/solve.mjs            every level
//   node tools/solve.mjs A3         one level (prints only)
//   node tools/solve.mjs --missing  only levels without a stored solution, merged in
import { readFileSync, writeFileSync } from 'node:fs';
import { DIRS } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
import { solve } from '../src/solver.js';

const file = new URL('../src/solutions.json', import.meta.url);
const missing = process.argv[2] === '--missing';
const only = missing ? null : process.argv[2];
const stored = missing ? JSON.parse(readFileSync(file)) : {};
const out = {};
let failed = 0;
for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  if (stored[level.id]) {
    out[level.id] = stored[level.id];
    continue;
  }
  const t = Date.now();
  const acts = solve(level);
  if (!acts) {
    console.log(`✗ ${level.id} ${level.name}: no solution found`);
    failed++;
    continue;
  }
  const par = acts.length + 2;
  out[level.id] = { par, route: acts };
  console.log(`✓ ${level.id} ${level.name}: ${acts.length} beats (par ${par}) ${acts.map((a) => (a < 0 ? '·' : DIRS[a].name)).join(' ')}  [${Date.now() - t}ms]`);
}
if (!only) writeFileSync(file, JSON.stringify(out, null, 0) + '\n');
process.exit(failed ? 1 : 0);
