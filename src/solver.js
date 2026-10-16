// Level solver, shared by tools/solve.mjs (par and stored hint routes) and the
// in-game hint, which plots a new route from wherever you are when you leave
// the old one. It runs a time-aware BFS between waypoints, trying every order
// of the notes left and optional plate and eraser stops, and keeps the shortest.
import { Sim, COUNT_IN, hexDist } from './sim.js';

export function cloneSim(s) {
  const c = Object.create(Sim.prototype);
  // shadow arrays are replaced, never changed in place, so they can be shared
  Object.assign(c, s, { segment: s.segment.slice(), echoes: s.echoes.slice(), collected: new Set(s.collected), erased: new Set(s.erased), broken: new Set(s.broken), opened: new Set(s.opened) });
  return c;
}

// Ways to get from `start` to `target` alive, shortest first. The first one is
// the shortest; with `extra` > 0 it keeps going for that many more beats and
// also returns later arrivals (up to `max`), because arriving later can leave
// a better echo behind, e.g. one that waits at the start while you get clear.
function legs(start, target, { extra = 0, max = 1, maxBeats = 60 } = {}) {
  const n0 = start.lastClosed + 1;
  const isExit = start.lv.cells.get(target).t === 'E';
  let frontier = [{ s: start, acts: [] }];
  const seen = new Set();
  const found = [];
  let last = n0 + maxBeats;
  for (let n = n0; n < last && frontier.length; n++) {
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
        const id = `${c.player}@${n}:${c.collected.size}:${c.erased.size}:${[...c.broken].join('|')}:${[...c.opened].join('')}:${c.shadows.join('|')}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const nacts = acts.concat([a]);
        if (c.player === target && (!isExit || res.type === 'won')) {
          if (isExit) return [{ s: c, acts: nacts }];
          found.push({ s: c, acts: nacts });
          if (found.length === 1) last = Math.min(last, n + 1 + extra);
          if (found.length >= max) return found;
          continue;
        }
        next.push({ s: c, acts: nacts });
      }
    }
    // keep the search bounded on open maps
    frontier = next.length > 4000 ? next.slice(0, 4000) : next;
  }
  return found;
}

// Everything about a state that matters for what can happen next.
function signature(s) {
  return [
    s.player, s.lastClosed, s.closePos, s.gatesOpen, [...s.collected].sort(), [...s.erased].sort(), [...s.broken].sort(),
    [...s.opened].sort().join(''), s.shadows.join('|'), s.shadowPlan.join('|'), s.segment.join(' '),
    s.echoes.map((e) => e.born + ':' + e.path.join(' ')).join('/'),
  ].join(';');
}

// Fewest beats a plan's remaining waypoints could take (portals can beat it, so none then).
function lowerBound(s, plan, i) {
  if (Object.keys(s.lv.teleports).length) return 0;
  let at = s.lv.cells.get(s.player), sum = 0;
  for (let j = i; j < plan.length; j++) {
    if (typeof plan[j] === 'number') sum += plan[j];
    else {
      const c = s.lv.cells.get(plan[j]);
      sum += hexDist(at, c);
      at = c;
    }
  }
  return sum;
}

// Follows a plan (waypoints, or a number of beats to wait) and returns the
// shortest winning action list it finds, or null. With `deep`, every leg also
// tries later arrivals; `bound` cuts off anything not shorter than it. `cache`
// remembers legs already searched, so plans that share a start share the work.
export function runPlan(start, plan, { deep = null, bound = Infinity, cache = new Map() } = {}) {
  let best = null;
  const go = (s, i, acts) => {
    if (acts.length + lowerBound(s, plan, i) >= (best ? best.length : bound)) return;
    if (i === plan.length) {
      if (s.status === 'won') best = acts;
      return;
    }
    const wp = plan[i];
    if (typeof wp === 'number') {
      const c = cloneSim(s);
      const waits = [];
      for (let k = 0; k < wp; k++) {
        if (c.close(c.lastClosed + 1).type === 'dead') return;
        waits.push(-1);
      }
      return go(c, i + 1, acts.concat(waits));
    }
    const opts = deep && s.lv.cells.get(wp).t !== 'E' ? deep : {};
    const k = signature(s) + '>' + wp + '>' + (opts.max || 1);
    if (!cache.has(k)) cache.set(k, legs(s, wp, opts));
    for (const o of cache.get(k)) go(o.s, i + 1, acts.concat(o.acts));
  };
  go(cloneSim(start), 0, []);
  return best;
}

function permutations(list) {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p]));
}

export function plansFrom(s) {
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
// A quick pass tries every plan with the fastest way through each leg; a deep
// pass then also tries arriving later at each waypoint (or with `deep: false`,
// only when the quick pass found nothing). After budgetMs it settles for the
// best route found so far; after limitMs it gives up even if it has none.
export function solveFrom(start, { budgetMs = Infinity, limitMs = Infinity, deep = 'always' } = {}) {
  const t0 = Date.now();
  const plans = plansFrom(start);
  let best = null;
  const out = () => {
    const spent = Date.now() - t0;
    return (best && spent > budgetMs) || spent > limitMs;
  };
  const cache = new Map();
  for (const plan of plans) {
    const acts = runPlan(start, plan, { cache, bound: best ? best.length : Infinity });
    if (acts && (!best || acts.length < best.length)) best = acts;
    if (out()) return best;
  }
  if (deep === false || (deep === 'needed' && best)) return best;
  for (const plan of plans) {
    const acts = runPlan(start, plan, { cache, deep: { extra: 8, max: 6 }, bound: best ? best.length : Infinity });
    if (acts && (!best || acts.length < best.length)) best = acts;
    if (out()) return best;
  }
  return best;
}

// Shortest route for a level from the start of play.
export function solve(level) {
  const s = new Sim(level);
  for (let n = 0; n < COUNT_IN; n++) s.close(n);
  return solveFrom(s);
}
