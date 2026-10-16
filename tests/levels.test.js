// Every level must parse, have a reachable exit, and be beaten by its stored hint route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS, SIDES, INTROS } from '../src/levels.js';
import { Sim, replay, starsFor } from '../src/sim.js';

const SOLUTIONS = JSON.parse(readFileSync(new URL('../src/solutions.json', import.meta.url)));

test('level ids are unique and grouped by side', () => {
  const ids = LEVELS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const l of LEVELS) assert.ok(SIDES.some((s) => s.id === l.id[0]), l.id);
  assert.equal(LEVELS.length, 52);
});

test('every intro a level asks for exists', () => {
  for (const l of LEVELS) if (l.intro) assert.ok(INTROS[l.intro], `${l.id} intro ${l.intro}`);
});

for (const level of LEVELS) {
  test(`${level.id} ${level.name}: parses and its hint route wins`, () => {
    const s = new Sim(level);
    assert.ok(s.lv.start, 'has a start');
    assert.ok(s.lv.exit, 'has an exit');
    assert.ok(level.bpm >= 80 && level.bpm <= 140, 'sane tempo');
    const sol = SOLUTIONS[level.id];
    assert.ok(sol, 'has a stored solution');
    const { result, beats } = replay(level, sol.route);
    assert.equal(result.type, 'won', `route ends ${result.type} (${result.reason || ''})`);
    assert.equal(beats, sol.route.length);
    assert.ok(sol.par >= beats, 'par is reachable');
    assert.equal(starsFor(beats, sol.par), 3);
  });
}

test('metronome patrols stay on walkable floor', () => {
  for (const level of LEVELS) {
    const s = new Sim(level);
    for (const m of s.lv.metronomes) {
      assert.ok(m.path.length >= 2, `${level.id} metronome has room to move`);
      for (const k of m.path) assert.ok(s.walkable(k), `${level.id} metronome path on ${k}`);
    }
  }
});
