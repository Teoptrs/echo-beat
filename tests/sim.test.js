// Rules of the board, one mechanic at a time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, COUNT_IN, DIR_BY_NAME as D, replay, starsFor, key } from '../src/sim.js';

const N = D.N, S = D.S, STAY = -1;

function fresh(map, extra = {}) {
  const s = new Sim({ id: 't', bpm: 100, map, ...extra });
  for (let n = 0; n < COUNT_IN; n++) s.close(n);
  return s;
}

function step(s, a) {
  const n = s.lastClosed + 1;
  if (a >= 0) s.move(n, a);
  return s.close(n);
}

test('count-in beats cannot be moved on', () => {
  const s = new Sim({ map: ['.', 'S'] });
  assert.equal(s.canMove(0), false);
  for (let n = 0; n < COUNT_IN; n++) s.close(n);
  assert.equal(s.canMove(COUNT_IN), true);
});

test('walls and gaps bump you back', () => {
  const s = fresh(['#', 'S', ' ']);
  const r = s.move(COUNT_IN, N);
  assert.equal(r.type, 'bump');
  assert.equal(s.player, s.lv.start);
});

test('a note turns the route since the last note into an echo', () => {
  const s = fresh(['E', 'o', '.', 'S']);
  step(s, N);
  const r = s.move(s.lastClosed + 1, N);
  assert.equal(r.events[0].type, 'note');
  const echo = s.echoes[0];
  assert.equal(echo.path.length, 3);
  assert.equal(echo.path[0], s.lv.start);
  assert.equal(s.exitOpen, true);
});

test('a fresh echo is harmless for one beat, then deadly', () => {
  // walk up to the note, then stand still: the echo walks back down onto you? No: it starts where you started.
  const s = fresh(['o', '.', 'S']);
  step(s, N);
  step(s, N); // note taken on this beat; echo path = [S, mid, note]
  const e = s.echoes[0];
  assert.equal(s.echoPos(e, e.born), s.lv.start);
  assert.equal(s.echoHarmful(e, e.born + 1), false);
  assert.equal(s.echoHarmful(e, e.born + 2), true);
  // echo walks S -> mid -> note: staying on the note gets you caught
  assert.equal(step(s, STAY).type, 'ok');
  assert.equal(step(s, STAY).type, 'dead');
});

test('swapping places with an echo kills you', () => {
  const s = fresh(['.', 'o', '.', 'S']);
  step(s, N);
  step(s, N); // note at row 1; echo replays [S, row2, row1]
  step(s, N); // you go to row 0; echo at row2 (harmless)
  const r1 = step(s, S); // you to row1, echo to row1 → same hex
  assert.equal(r1.type, 'dead');
});

test('spikes: down, down, warning, up', () => {
  const s = fresh(['^', 'S']);
  const k = key(0, 0);
  const seen = [0, 1, 2, 3].map((i) => s.spikeState(k, COUNT_IN + i));
  assert.deepEqual(seen.sort(), ['down', 'down', 'rising', 'up'].sort());
});

test('standing on spikes when they come up ends the run', () => {
  const map = ['^', 'S'];
  for (let wait = 0; wait < 4; wait++) {
    const s = fresh(map);
    for (let i = 0; i < wait; i++) step(s, STAY);
    const n = s.lastClosed + 1;
    const r = step(s, N);
    const state = s.spikeState(key(0, 0), n);
    assert.equal(r.type === 'dead', state === 'up', `wait ${wait}: ${state}`);
  }
});

test('plates hold gates open, for you or your echo', () => {
  const s = fresh(['G', '.', 'p', 'S']);
  assert.equal(s.walkable(key(0, 0)), false);
  step(s, N);
  assert.equal(s.gatesOpen, true);
  step(s, N);
  assert.equal(s.gatesOpen, false);
});

test('cracked floor falls after you leave it', () => {
  const s = fresh(['.', 'c', 'S']);
  step(s, N);
  assert.equal(s.broken.size, 0);
  const r = step(s, N);
  assert.equal(r.events[0].type, 'crumble');
  assert.equal(s.walkable(key(0, 1)), false);
});

test('portals move you to their twin on the same beat', () => {
  const s = fresh(['T', ' ', 'T', 'S']);
  const r = s.move(COUNT_IN, N);
  assert.equal(r.to, key(0, 0));
  assert.equal(r.events[0].type, 'teleport');
});

test('erasers remove your oldest echo once', () => {
  const s = fresh(['x', 'o', 'S']);
  step(s, N);
  assert.equal(s.echoes.length, 1);
  const r = s.move(s.lastClosed + 1, N);
  assert.equal(r.events[0].type, 'erase');
  assert.equal(s.echoes.length, 0);
});

test('metronomes patrol back and forth and kill on contact', () => {
  const level = { map: ['.', '.', '.', 'S'], metronomes: [{ at: [0, 0], dir: 'S' }] };
  const s = new Sim(level);
  const m = s.lv.metronomes[0];
  assert.equal(m.path.length, 4);
  const at = [0, 1, 2, 3, 4, 5, 6].map((n) => s.metronomePos(m, n));
  assert.deepEqual(at, [m.path[0], m.path[1], m.path[2], m.path[3], m.path[2], m.path[1], m.path[0]]);
  const { result } = replay(level, Array(8).fill(STAY));
  assert.equal(result.type, 'dead');
  assert.equal(result.reason, 'metronome');
});

test('snapshots restore the exact board', () => {
  const s = fresh(['E', 'o', '.', 'S']);
  step(s, N);
  step(s, N);
  const snap = s.snapshot();
  step(s, N);
  s.restore(snap);
  assert.equal(s.player, key(0, 1));
  assert.equal(s.echoes.length, 1);
  assert.equal(s.lastClosed, COUNT_IN + 1);
});

test('stars: par or better is three', () => {
  assert.equal(starsFor(10, 10), 3);
  assert.equal(starsFor(15, 10), 2);
  assert.equal(starsFor(16, 10), 1);
});
