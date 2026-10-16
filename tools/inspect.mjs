// Level design aid: draws a level as text and reports what the solver finds.
//   node tools/inspect.mjs A3            one level from src/levels.js
//   node tools/inspect.mjs path/to.mjs   levels exported as `default` (an array) from a scratch file;
//                                        they may be drawn as `pic` pictures (see hexpic.mjs)
// "free" is the shortest win with echoes made harmless: when it equals par,
// the echoes never forced a detour or a wait.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Sim, COUNT_IN, DIRS } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
import { solveFrom, plansFrom, runPlan } from '../src/solver.js';
import { picture, fromPicture } from './hexpic.mjs';

// Floor cells you could never reach, even with every door, gate and wall open.
export function unreachable(level) {
  const s = new Sim(level);
  const open = (k) => s.lv.cells.has(k) && s.lv.cells.get(k).t !== '#';
  const seen = new Set([s.lv.start]);
  const todo = [s.lv.start];
  while (todo.length) {
    const k = todo.pop();
    for (let d = 0; d < 6; d++) {
      const n = s.neighbor(k, d);
      if (open(n) && !seen.has(n)) {
        seen.add(n);
        todo.push(n);
      }
    }
    if (s.lv.teleports[k] && !seen.has(s.lv.teleports[k])) {
      seen.add(s.lv.teleports[k]);
      todo.push(s.lv.teleports[k]);
    }
  }
  return [...s.lv.cells.values()].filter((c) => open(c.k) && !seen.has(c.k)).map((c) => `${c.t}(${c.q},${c.r + (c.q - (c.q & 1)) / 2})`);
}

function started(level, tweak) {
  const s = new Sim(level);
  if (tweak) tweak(s);
  for (let n = 0; n < COUNT_IN; n++) s.close(n);
  return s;
}

export function inspect(level, { orders = true } = {}) {
  const t = Date.now();
  const best = solveFrom(started(level));
  const ms = Date.now() - t;
  const free = solveFrom(started(level, (s) => (s.echoHarmful = () => false)));
  const info = { id: level.id, name: level.name, par: best ? best.length + 2 : null, beats: best?.length ?? null, free: free?.length ?? null, ms };
  if (level.map.some((r) => r.includes('@'))) {
    // the same level with no shadow, to see how much it costs
    const calm = solveFrom(started({ ...level, map: level.map.map((r) => r.replaceAll('@', '.')) }));
    info.noShadow = calm?.length ?? null;
  }
  if (best) {
    const s = started(level);
    const seen = new Set([s.player]);
    let n = COUNT_IN, revisits = 0;
    for (const a of best) {
      if (a >= 0) s.move(n, a);
      s.close(n++);
      if (a >= 0 && seen.has(s.player)) revisits++;
      seen.add(s.player);
    }
    // what happened along the way (shadows lost, keys picked up)
    const r = started(level);
    const events = [];
    let m = COUNT_IN;
    for (const a of best) {
      if (a >= 0) for (const e of r.move(m, a).events || []) if (e.type === 'key' || e.type === 'erase') events.push(`${e.type}${e.letter ? ':' + e.letter : ''}@${m - COUNT_IN + 1}`);
      for (const e of r.close(m).events || []) if (e.type === 'shadowGone') events.push(`shadow-${e.reason}@${m - COUNT_IN + 1}`);
      m++;
    }
    info.events = events.join(' ');
    info.waits = best.filter((a) => a < 0).length;
    info.revisits = revisits;
    info.route = best.map((a) => (a < 0 ? '·' : DIRS[a].name)).join(' ');
  }
  if (orders) {
    // how many different note orders can win, and how long each is
    const s0 = started(level);
    const byOrder = new Map();
    for (const plan of plansFrom(s0)) {
      const order = plan.filter((k) => s0.lv.notes.includes(k)).map((k) => s0.lv.notes.indexOf(k) + 1).join('');
      const acts = runPlan(s0, plan, { deep: { extra: 8, max: 6 } });
      if (acts && (!byOrder.has(order) || acts.length < byOrder.get(order))) byOrder.set(order, acts.length);
    }
    info.orders = [...byOrder].sort((a, b) => a[1] - b[1]).map(([o, l]) => `${o || '-'}:${l}`).join(' ');
  }
  return info;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  let list = LEVELS;
  if (arg && /\.m?js$/.test(arg)) list = (await import(pathToFileURL(resolve(arg)).href)).default;
  else if (arg) list = LEVELS.filter((l) => l.id === arg || l.id.startsWith(arg + ':'));
  const only = process.argv[3];
  for (let level of list) {
    if (level.pic) level = { ...level, ...fromPicture(level.pic, level.dirs) };
    if (only && level.id !== only) continue;
    console.log(`\n${level.id} ${level.name}  (${level.bpm} bpm)`);
    console.log(picture(level));
    const i = inspect(level);
    console.log(`par ${i.par}  beats ${i.beats}  free ${i.free}${'noShadow' in i ? '  noShadow ' + i.noShadow : ''}  waits ${i.waits}  revisits ${i.revisits}  [${i.ms}ms]`);
    console.log(`route ${i.route}${i.events ? '   [' + i.events + ']' : ''}`);
    console.log(`orders ${i.orders}`);
    const lost = unreachable(level);
    if (lost.length) console.log(`UNREACHABLE from the start: ${lost.join(' ')}`);
    if (level.pic) console.log(level.map.map((r) => `'${r}',`).join('\n'));
  }
}
