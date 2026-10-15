// Level solver, shared by tools/solve.mjs (par and stored hint routes) and the
// in-game hint, which plots a new route from wherever you are when you leave
// the old one. It runs a time-aware BFS between waypoints, trying every order
// of the notes left and optional plate and eraser stops, and keeps the shortest.
import { Sim, COUNT_IN } from './sim.js';

export function cloneSim(s) {
  const c = Object.create(Sim.prototype);
  Object.assign(c, s, { segment: s.segment.slice(), echoes: s.echoes.slice(), collected: new Set(s.collected), erased: new Set(s.erased), broken: new Set(s.broken) });
  return c;
}

// Shortest action list from `start` that ends with the player on `target`, alive.
function bfs(start, target, maxBeats = 60) {
  const n0 = start.lastClosed + 1;
  let frontier = [{ s: start, acts: [] }];
  const seen = new Set();
  for (let n = n0; n < n0 + maxBeats && frontier.length; n++) {
    const next = [];
    for (const { s, acts } of frontier) {
      for (let a = -1; a < 6; a++) {
        const c = cloneSim(s);
        if (a >= 0) {
          const r = c.move(n, a);
          if (r.type === 'bump') continue;
          const t = c.lv.cells.get(c.player).t;
          // don't grab notes or erasers that aren't the current target
          if (c.player !== target && ((t === 'o' && !s.collected.has(c.player)) || (t === 'x' && !s.erased.has(c.player)))) continue;
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

function runPlan(start, plan) {
  let s = cloneSim(start);
  const acts = [];
  for (const wp of plan) {
    if (typeof wp === 'number') {
      for (let i = 0; i < wp; i++) {
        if (s.close(s.lastClosed + 1).type === 'dead') return null;
        acts.push(-1);
      }
      continue;
    }
    const r = bfs(s, wp);
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

function plansFrom(s) {
  const lv = s.lv;
  const plans = [];
  const orders = permutations(lv.notes.filter((k) => !s.collected.has(k)));
  const extras = [[]];
  for (const e of lv.erasers) if (!s.erased.has(e)) extras.push([e]);
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
  return plans;
}

// Shortest route found from the state `start` (a Sim between beats), as a list
// of actions for beats start.lastClosed + 1 onward (-1 = stay), or null.
// After budgetMs it settles for the best route found so far; after limitMs it
// gives up even if it has none.
export function solveFrom(start, { budgetMs = Infinity, limitMs = Infinity } = {}) {
  const t0 = Date.now();
  let best = null;
  for (const plan of plansFrom(start)) {
    const acts = runPlan(start, plan);
    if (acts && (!best || acts.length < best.length)) best = acts;
    const spent = Date.now() - t0;
    if ((best && spent > budgetMs) || spent > limitMs) break;
  }
  return best;
}

// Shortest route for a level from the start of play.
export function solve(level) {
  const s = new Sim(level);
  for (let n = 0; n < COUNT_IN; n++) s.close(n);
  return solveFrom(s);
}
