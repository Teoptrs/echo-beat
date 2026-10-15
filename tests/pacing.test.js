import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pace, nextGap } from '../src/pacing.js';
import { ADS } from '../src/config.js';

const rules = ADS.interstitial;

// Plays a run of clears with a fixed gap between them; returns which clears showed an ad.
function run(ids, { secondsEach = 60, rand = Math.random } = {}) {
  let countdown = null;
  let lastAt = -Infinity;
  const shown = [];
  ids.forEach((levelId, i) => {
    const now = i * secondsEach * 1000;
    const r = pace({ levelId, countdown, now, lastAt, rules, rand });
    countdown = r.countdown;
    if (r.show) {
      lastAt = now;
      shown.push(i);
    }
  });
  return shown;
}

test('side A is ad-free', () => {
  const ids = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A1', 'A2'];
  assert.deepEqual(run(ids), []);
});

test('after side A, an ad every 2 or 3 clears', () => {
  for (const rand of [() => 0, () => 0.99, Math.random]) {
    const ids = [...Array(8)].map((_, i) => 'A' + (i + 1)).concat([...Array(30)].map((_, i) => 'BC'[i % 2] + ((i % 8) + 1)));
    const shown = run(ids, { rand });
    assert.ok(shown.length >= 9, `only ${shown.length} ads`);
    assert.ok(shown[0] - 7 === 2 || shown[0] - 7 === 3, `first ad after ${shown[0] - 7} side B clears`);
    for (let k = 1; k < shown.length; k++) {
      const gap = shown[k] - shown[k - 1];
      assert.ok(gap === 2 || gap === 3, `gap of ${gap} clears`);
    }
  }
});

test('two quick clears never show two ads within the minimum gap', () => {
  const ids = [...Array(12)].map((_, i) => 'B' + ((i % 8) + 1));
  const shown = run(ids, { secondsEach: 10, rand: () => 0 });
  for (let k = 1; k < shown.length; k++) assert.ok((shown[k] - shown[k - 1]) * 10_000 >= rules.minGapMs);
  assert.ok(shown.length > 0);
});

test('gaps stay within the configured range', () => {
  for (let i = 0; i < 200; i++) {
    const g = nextGap(rules.every);
    assert.ok(g >= 2 && g <= 3);
  }
});
