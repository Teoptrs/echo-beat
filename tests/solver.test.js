import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, COUNT_IN } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
import { solveFrom, cloneSim } from '../src/solver.js';
import SOLUTIONS from '../src/solutions.json' with { type: 'json' };

// Follows the stored route, but misses one beat (stays put) at `skip`.
// Returns the state right after that beat, or null if that was fatal.
function missBeat(level, route, skip) {
  const s = new Sim(level);
  for (let n = 0; n < COUNT_IN; n++) s.close(n);
  for (let i = 0; i <= skip; i++) {
    const n = COUNT_IN + i;
    if (i < skip && route[i] >= 0) s.move(n, route[i]);
    if (s.close(n).type !== 'playing' && s.status !== 'playing') return null;
  }
  return s.status === 'playing' ? s : null;
}

function wins(start, acts) {
  const s = cloneSim(start);
  let n = s.lastClosed + 1;
  for (const a of acts) {
    if (a >= 0) s.move(n, a);
    s.close(n++);
    if (s.status !== 'playing') break;
  }
  return s.status === 'won';
}

test('after a missed beat, the hint finds a new winning route', () => {
  let tried = 0;
  for (const level of LEVELS) {
    const { route } = SOLUTIONS[level.id];
    for (const skip of [1, Math.floor(route.length / 2)]) {
      if (route[skip] < 0) continue; // staying was the plan anyway
      const s = missBeat(level, route, skip);
      if (!s) continue;
      tried++;
      const acts = solveFrom(s, { budgetMs: 1200, limitMs: 6000 });
      assert.ok(acts, `${level.id}: no route after missing beat ${skip}`);
      assert.ok(wins(s, acts), `${level.id}: re-plotted route doesn't win`);
    }
  }
  assert.ok(tried >= 30, `only ${tried} cases`);
});
