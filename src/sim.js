// Echo Beat rules: pure, deterministic and DOM-free, shared by the game, the
// level solver and the tests.
//
// Everything happens on the beat. On each beat you may step to one of the six
// neighbouring hexes or stay put. Grabbing a note turns the route you walked
// since the previous note into an echo: a ghost that replays it on the beat,
// back and forth, forever. Shortly after every beat the board is checked:
// sharing a hex with an echo, a metronome or your shadow, swapping places with
// one, or standing on spikes while they are fully up ends the run.

// Flat-top hexes, axial coordinates. `a` is the screen angle of each direction.
export const DIRS = [
  { name: 'N', q: 0, r: -1, a: -90 },
  { name: 'NE', q: 1, r: -1, a: -30 },
  { name: 'SE', q: 1, r: 0, a: 30 },
  { name: 'S', q: 0, r: 1, a: 90 },
  { name: 'SW', q: -1, r: 1, a: 150 },
  { name: 'NW', q: -1, r: 0, a: -150 },
];
export const DIR_BY_NAME = Object.fromEntries(DIRS.map((d, i) => [d.name, i]));
export const COUNT_IN = 4; // beats of count-in before you can move
export const FORM = 1; // a new echo is harmless until it has made this many moves
export const SPIKE_CYCLE = ['down', 'down', 'rising', 'up'];
const SPIKE_PHASE = { '^': 0, 1: 0, 2: 1, v: 2, 3: 2, 4: 3 };
export const KEY_TILES = ['a', 'b', 'd']; // keys; the matching doors are 'A', 'B', 'D'
export const DOOR_TILES = KEY_TILES.map((t) => t.toUpperCase());

export const key = (q, r) => q + ',' + r;

// Map legend (rows of characters, "odd-q" offset layout: odd columns sit half a hex lower)
//   .  floor     #  wall      (space)  nothing
//   S  start     o  note      E  exit (opens when every note is taken)
//   p  plate     G  gate: open while anyone (you, an echo, a shadow) stands on any plate
//   ^ v 1 2 3 4  spikes on a 4-beat cycle (down, down, rising, up); the symbol sets the phase
//   c  cracked floor: falls away once you step off it (echoes float over the hole)
//   T  teleporter pair, U  second pair: step on one, come out of the other
//   x  eraser: wipes out your oldest echo
//   @  your shadow starts here (on floor): every second beat it steps toward you
//   a b d  keys; A B D  doors: a key opens every door of its letter, for good
// level.metronomes: [{ at: [col, row], dir: 'NE' }] patrol a straight line, bouncing off walls
export function parseLevel(level) {
  const cells = new Map();
  const lv = { cells, notes: [], plates: [], gates: [], erasers: [], teleports: {}, start: null, exit: null, metronomes: [], shadows: [], keys: [], doors: [] };
  const pads = { T: [], U: [] };
  level.map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === ' ') return;
      const q = x, r = y - (x - (x & 1)) / 2;
      const k = key(q, r);
      cells.set(k, { q, r, t: ch, k });
      if (ch === 'S') lv.start = k;
      if (ch === 'E') lv.exit = k;
      if (ch === 'o') lv.notes.push(k);
      if (ch === 'p') lv.plates.push(k);
      if (ch === 'G') lv.gates.push(k);
      if (ch === 'x') lv.erasers.push(k);
      if (ch === 'T' || ch === 'U') pads[ch].push(k);
      if (ch === '@') lv.shadows.push(k);
      if (KEY_TILES.includes(ch)) lv.keys.push(k);
      if (DOOR_TILES.includes(ch)) lv.doors.push(k);
    });
  });
  for (const list of Object.values(pads)) {
    if (list.length === 2) {
      lv.teleports[list[0]] = list[1];
      lv.teleports[list[1]] = list[0];
    }
  }
  const solid = (k) => {
    const c = cells.get(k);
    return !c || c.t === '#' || c.t === 'G' || DOOR_TILES.includes(c.t);
  };
  for (const [i, m] of (level.metronomes || []).entries()) {
    const [x, y] = m.at;
    const start = key(x, y - (x - (x & 1)) / 2);
    const d = DIR_BY_NAME[m.dir];
    const step = (k, s) => {
      const c = cells.get(k);
      return key(c.q + DIRS[d].q * s, c.r + DIRS[d].r * s);
    };
    // walk back to one end, then forward to the other: that is the patrol line
    let back = start;
    while (!solid(step(back, -1))) back = step(back, -1);
    const path = [back];
    while (!solid(step(path[path.length - 1], 1))) path.push(step(path[path.length - 1], 1));
    lv.metronomes.push({ path, phase: path.indexOf(start), id: 'm' + i });
  }
  return lv;
}

// Hex distance between two cells.
export function hexDist(a, b) {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

const pingPong = (path, k) => {
  const n = path.length;
  if (n === 1) return path[0];
  const period = 2 * (n - 1);
  const t = ((k % period) + period) % period;
  return path[t < n ? t : period - t];
};

export class Sim {
  constructor(level) {
    this.level = level;
    this.lv = parseLevel(level);
    this.reset();
  }

  reset() {
    this.player = this.lv.start;
    this.closePos = this.lv.start; // where you were at the end of the last beat
    this.segment = [this.lv.start]; // your positions since the last note, one per beat
    this.echoes = [];
    this.nextEchoId = 1;
    this.collected = new Set(); // notes taken
    this.erased = new Set(); // erasers used
    this.broken = new Set(); // cracked tiles that have fallen
    this.gatesOpen = false;
    this.opened = new Set(); // key letters picked up, so their doors are open
    this.shadows = this.lv.shadows.slice(); // where each shadow stands (null once it is gone)
    this.shadowPrev = this.shadows.slice(); // ... and where it stood the beat before
    this.movedBeat = -1;
    this.lastClosed = COUNT_IN - 1;
    this.status = 'playing';
    this.shadowPlan = this.planShadows();
  }

  snapshot() {
    return {
      player: this.player, closePos: this.closePos, segment: this.segment.slice(), echoes: this.echoes.slice(),
      nextEchoId: this.nextEchoId, collected: new Set(this.collected), erased: new Set(this.erased),
      broken: new Set(this.broken), gatesOpen: this.gatesOpen, opened: new Set(this.opened),
      shadows: this.shadows.slice(), shadowPrev: this.shadowPrev.slice(), shadowPlan: this.shadowPlan.slice(),
      movedBeat: this.movedBeat, lastClosed: this.lastClosed, status: 'playing',
    };
  }

  restore(s) {
    Object.assign(this, s, {
      segment: s.segment.slice(), echoes: s.echoes.slice(), collected: new Set(s.collected), erased: new Set(s.erased), broken: new Set(s.broken),
      opened: new Set(s.opened), shadows: s.shadows.slice(), shadowPrev: s.shadowPrev.slice(), shadowPlan: s.shadowPlan.slice(),
    });
  }

  get notesLeft() {
    return this.lv.notes.length - this.collected.size;
  }

  get exitOpen() {
    return this.notesLeft === 0;
  }

  neighbor(k, d) {
    const c = this.lv.cells.get(k);
    return key(c.q + DIRS[d].q, c.r + DIRS[d].r);
  }

  // Where echo e stands after beat m: its route played forward, then backward, forever.
  echoPos(e, m) {
    return m - e.born <= 0 ? e.path[0] : pingPong(e.path, m - e.born);
  }

  metronomePos(m, n) {
    return pingPong(m.path, n + m.phase);
  }

  echoHarmful(e, m) {
    return m - e.born > FORM;
  }

  // Everything that can kill you after beat n, with where it was the beat before.
  hazards(n) {
    const out = [];
    for (const e of this.echoes) if (this.echoHarmful(e, n)) out.push({ who: e, now: this.echoPos(e, n), prev: this.echoPos(e, n - 1), kind: 'echo' });
    for (const m of this.lv.metronomes) out.push({ who: m, now: this.metronomePos(m, n), prev: this.metronomePos(m, n - 1), kind: 'metronome' });
    return out;
  }

  // Did something deadly share a hex with, or swap places with, whoever went from `before` to `at`?
  hit(hazards, at, before) {
    return hazards.find((h) => h.now === at || (h.now === before && h.prev === at && at !== before));
  }

  spikeState(k, n) {
    const t = this.lv.cells.get(k)?.t;
    if (!(t in SPIKE_PHASE)) return null;
    return SPIKE_CYCLE[(((n + SPIKE_PHASE[t]) % 4) + 4) % 4];
  }

  isSpike(k) {
    return this.lv.cells.get(k)?.t in SPIKE_PHASE;
  }

  // Can you stand on k (ignoring hazards)?
  walkable(k) {
    const c = this.lv.cells.get(k);
    if (!c || c.t === '#' || this.broken.has(k)) return false;
    if (c.t === 'G' && !this.gatesOpen) return false;
    if (DOOR_TILES.includes(c.t) && !this.doorOpen(k)) return false;
    return true;
  }

  doorOpen(k) {
    return this.opened.has(this.lv.cells.get(k).t.toLowerCase());
  }

  // Shadows step on every second beat of play: your 2nd, 4th, 6th...
  shadowBeat(n) {
    return n > COUNT_IN && (n - COUNT_IN) % 2 === 1;
  }

  // Where a shadow standing on k steps when it next moves: one hex straight
  // toward you (where you stand as the beat starts), but only if that brings it
  // closer. Walls, gaps and closed gates or doors stop it.
  shadowStep(k) {
    const at = this.lv.cells.get(k), you = this.lv.cells.get(this.closePos);
    const d0 = hexDist(at, you);
    const yx = 1.5 * you.q, yy = Math.sqrt(3) * (you.r + you.q / 2);
    let best = k, bestD = d0, bestE = Infinity;
    for (let d = 0; d < 6; d++) {
      const nk = this.neighbor(k, d);
      if (!this.walkable(nk)) continue;
      const c = this.lv.cells.get(nk);
      const dist = hexDist(c, you);
      if (dist > bestD || dist >= d0) continue;
      // ties go to the step that points most directly at you
      const e = Math.hypot(1.5 * c.q - yx, Math.sqrt(3) * (c.r + c.q / 2) - yy);
      if (dist < bestD || e < bestE - 1e-9) {
        best = nk;
        bestD = dist;
        bestE = e;
      }
    }
    return best;
  }

  // Where every shadow will stand after the next beat. Decided as the beat
  // starts, so it can be drawn ahead of time like an echo's next step.
  planShadows() {
    const moves = this.shadowBeat(this.lastClosed + 1);
    return this.shadows.map((k) => (k && moves ? this.shadowStep(k) : k));
  }

  canMove(n) {
    return this.status === 'playing' && n >= COUNT_IN && n > this.lastClosed && this.movedBeat !== n;
  }

  // Your step for beat n. It is judged when the beat closes.
  move(n, d) {
    this.movedBeat = n;
    const to = this.neighbor(this.player, d);
    if (!this.walkable(to)) return { type: 'bump', to };
    let at = to;
    const events = [];
    if (this.lv.teleports[to]) {
      at = this.lv.teleports[to];
      events.push({ type: 'teleport', from: to, to: at });
    }
    this.player = at;
    const c = this.lv.cells.get(at);
    if (c.t === 'x' && !this.erased.has(at)) {
      this.erased.add(at);
      const gone = this.echoes.shift();
      events.push({ type: 'erase', echo: gone });
    }
    if (KEY_TILES.includes(c.t) && !this.opened.has(c.t)) {
      this.opened.add(c.t);
      events.push({ type: 'key', letter: c.t, doors: this.lv.doors.filter((d) => this.lv.cells.get(d).t === c.t.toUpperCase()) });
    }
    if (c.t === 'o' && !this.collected.has(at)) {
      this.collected.add(at);
      const echo = { path: this.segment.concat([at]), born: n, id: this.nextEchoId++ };
      this.segment = [];
      this.echoes.push(echo);
      events.push({ type: 'note', echo });
    }
    return { type: 'move', to: at, step: to, events };
  }

  // Shortly after beat n: judge the board.
  close(n) {
    this.lastClosed = n;
    if (n < COUNT_IN) {
      this.shadowPlan = this.planShadows();
      return { type: 'countin' };
    }
    const P = this.player, before = this.closePos;
    this.shadowPrev = this.shadows;
    this.shadows = this.shadowPlan;
    const hazards = this.hazards(n);
    const shadowHazards = [];
    this.shadows.forEach((k, i) => {
      if (k) shadowHazards.push({ who: i, now: k, prev: this.shadowPrev[i], kind: 'shadow' });
    });
    const h = this.hit(hazards.concat(shadowHazards), P, before);
    if (h) {
      this.status = 'dead';
      return { type: 'dead', reason: h.kind, who: h.who };
    }
    if (this.spikeState(P, n) === 'up') {
      this.status = 'dead';
      return { type: 'dead', reason: 'spike' };
    }
    const events = [];
    if (before !== P && this.lv.cells.get(before)?.t === 'c' && !this.broken.has(before)) {
      this.broken.add(before);
      events.push({ type: 'crumble', at: before });
    }
    // a shadow ends the way you would: echoes, metronomes, raised spikes, falling floor
    if (shadowHazards.length) {
      this.shadows = this.shadows.map((k, i) => {
        if (!k) return k;
        const h = this.hit(hazards, k, this.shadowPrev[i]);
        const why = h ? h.kind : this.spikeState(k, n) === 'up' ? 'spike' : this.broken.has(k) ? 'fall' : null;
        if (!why) return k;
        events.push({ type: 'shadowGone', at: k, reason: why, index: i });
        return null;
      });
    }
    this.segment.push(P);
    this.closePos = P;
    if (P === this.lv.exit && this.exitOpen) {
      this.status = 'won';
      return { type: 'won', events };
    }
    // anyone holds a plate down (you, an echo, a shadow), and nobody gets shut inside a gate
    const bodies = [P, ...this.shadows.filter(Boolean)];
    const pressed = this.lv.plates.some((k) => bodies.includes(k) || this.echoes.some((e) => this.echoPos(e, n) === k));
    this.gatesOpen = pressed || bodies.some((k) => this.lv.gates.includes(k));
    this.shadowPlan = this.planShadows();
    return { type: 'ok', events };
  }

  // Beats used so far (for par and stars).
  get beatsUsed() {
    return Math.max(0, this.lastClosed - COUNT_IN + 1);
  }
}

// Plays a list of actions (-1 = stay, 0..5 = direction) from the start; used by tests and hints.
export function replay(level, actions) {
  const s = new Sim(level);
  for (let n = 0; n < COUNT_IN; n++) s.close(n);
  let n = COUNT_IN;
  for (const a of actions) {
    if (a >= 0) s.move(n, a);
    const r = s.close(n);
    if (r.type !== 'ok') return { sim: s, result: r, beats: n - COUNT_IN + 1 };
    n++;
  }
  return { sim: s, result: { type: 'unfinished' }, beats: actions.length };
}

export function starsFor(beats, par) {
  if (beats <= par) return 3;
  if (beats <= par + Math.ceil(par * 0.5)) return 2;
  return 1;
}
