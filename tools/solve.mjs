// Level solver. For every level it searches for the shortest route it can find
// (time-aware BFS between waypoints, trying every note order and optional
// plate/eraser stops), then writes par beats and hint routes to
// src/solutions.json. Run: node tools/solve.mjs [levelId]
import { writeFileSync } from 'node:fs';
import { Sim, COUNT_IN, DIRS } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';

function clone(s) {
  const c = Object.create(Sim.prototype);
  Object.assign(c, s, { segment: s.segment.slice(), echoes: s.echoes.slice(), collected: new Set(s.collected), erased: new Set(s.erased), broken: new Set(s.broken) });
  return c;
}

// Shortest action list from `start` that ends with the player on `target`, alive.
function bfs(start, target, allowed, maxBeats = 60) {
  const n0 = start.lastClosed + 1;
  let frontier = [{ s: start, acts: [] }];
  const seen = new Set();
  for (let n = n0; n < n0 + maxBeats && frontier.length; n++) {
    const next = [];
    for (const { s, acts } of frontier) {
      for (let a = -1; a < 6; a++) {
        const c = clone(s);
        if (a >= 0) {
          const r = c.move(n, a);
          if (r.type === 'bump') continue;
          const t = c.lv.cells.get(c.player).t;
          // don't grab notes or erasers that aren't the current target
          if (c.player !== target && ((t === 'o' && !s.collected.has(c.player)) || (t === 'x' && !s.erased.has(c.player)))) continue;
          if (!allowed(c)) continue;
        }
        const res = c.close(n);
        if (res.type === 'dead') continue;
        const id = `${c.player}@${n}:${c.collected.size}:${c.erased.size}:${[...c.broken].join('|')}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const nacts = acts.concat([a]);
        if (c.player === target && (c.lv.cells.get(target).t !== 'E' || res.type === 'won')) return { s: c, acts: nacts };
        next.push({ s: c, acts: nacts });
      }
    }
    // keep the search bounded on open maps
    frontier = next.length > 4000 ? next.slice(0, 4000) : next;
  }
  return null;
}

function runPlan(level, plan) {
  let s = new Sim(level);
  for (let n = 0; n < COUNT_IN; n++) s.close(n);
  const acts = [];
  for (const wp of plan) {
    if (typeof wp === 'number') {
      for (let i = 0; i < wp; i++) {
        const n = s.lastClosed + 1;
        if (s.close(n).type === 'dead') return null;
        acts.push(-1);
      }
      continue;
    }
    const r = bfs(s, wp, () => true);
    if (!r) return null;
    s = r.s;
    acts.push(...r.acts);
  }
  return s.status === 'won' ? acts : null;
}

function permutations(list) {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p]));
}

function solve(level) {
  const lv = new Sim(level).lv;
  const plans = [];
  const orders = permutations(lv.notes);
  const extras = [[]];
  for (const e of lv.erasers) extras.push([e]);
  for (const order of orders) {
    for (const extra of extras) {
      // insert optional stops (an eraser) at every position
      const bases = extra.length ? [...Array(order.length + 1).keys()].map((i) => [...order.slice(0, i), ...extra, ...order.slice(i)]) : [order];
      for (const base of bases) {
        plans.push([...base, lv.exit]);
        for (const p of lv.plates) {
          for (let i = 0; i <= base.length; i++) {
            for (const wait of [0, 1, 2, 3]) {
              const stop = wait ? [p, wait] : [p];
              plans.push([...base.slice(0, i), ...stop, ...base.slice(i), lv.exit]);
            }
          }
        }
      }
    }
  }
  let best = null;
  for (const plan of plans) {
    const acts = runPlan(level, plan);
    if (acts && (!best || acts.length < best.length)) best = acts;
  }
  return best;
}

const only = process.argv[2];
const out = {};
let failed = 0;
for (const level of LEVELS) {
  if (only && level.id !== only) continue;
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
if (!only) writeFileSync(new URL('../src/solutions.json', import.meta.url), JSON.stringify(out, null, 0) + '\n');
process.exit(failed ? 1 : 0);
