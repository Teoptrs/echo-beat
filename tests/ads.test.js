// The native ad flow, run against a fake AdMob plugin.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _useFakeAdMob, showRewarded, rewardFailure, maybeInterstitial } from '../src/ads.js';
import { save } from '../src/save.js';

const EV = {
  RewardAdPluginEvents: { Rewarded: 'r.reward', Dismissed: 'r.dismissed', FailedToShow: 'r.failshow' },
  InterstitialAdPluginEvents: { Dismissed: 'i.dismissed', FailedToShow: 'i.failshow' },
};
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// Behaves like the Android plugin: one prepared ad per type, used up when shown.
function fakeAdMob({ failLoads = {}, skip = false } = {}) {
  const listeners = new Map();
  const emit = (name) => [...(listeners.get(name) || [])].forEach((fn) => fn());
  const prepared = { r: false, i: false };
  const fails = { r: failLoads.r || 0, i: failLoads.i || 0 };
  const log = [];
  const prepare = (k) => async () => {
    log.push('load ' + k);
    await tick();
    if (fails[k] > 0) {
      fails[k]--;
      throw new Error('No fill');
    }
    prepared[k] = true;
  };
  return {
    log,
    addListener: async (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return { remove: async () => listeners.get(name).delete(fn) };
    },
    prepareRewardVideoAd: prepare('r'),
    prepareInterstitial: prepare('i'),
    showRewardVideoAd: async () => {
      if (!prepared.r) throw new Error('No Reward Video Ad can be shown');
      prepared.r = false;
      log.push('show r');
      setTimeout(() => {
        if (!skip) emit('r.reward');
        emit('r.dismissed');
      }, 5);
    },
    showInterstitial: async () => {
      if (!prepared.i) throw new Error('No Interstitial can be shown');
      prepared.i = false;
      log.push('show i');
      setTimeout(() => emit('i.dismissed'), 5);
    },
  };
}

beforeEach(() => {
  save.adsRemoved = false;
  save.adCountdown = null;
});

test('two rewarded ads in a row both pay out', async () => {
  const ad = fakeAdMob();
  _useFakeAdMob(ad, EV);
  assert.equal(await showRewarded(), true);
  assert.equal(await showRewarded(), true);
  assert.deepEqual(ad.log.filter((l) => l.startsWith('show')), ['show r', 'show r']);
});

test('a failed load is retried when the player asks for an ad', async () => {
  const ad = fakeAdMob({ failLoads: { r: 1 } });
  _useFakeAdMob(ad, EV);
  assert.equal(await showRewarded(), false);
  assert.equal(rewardFailure(), 'unavailable');
  assert.equal(await showRewarded(), true);
});

test('skipping a rewarded ad reports it as closed early', async () => {
  _useFakeAdMob(fakeAdMob({ skip: true }), EV);
  assert.equal(await showRewarded(), false);
  assert.equal(rewardFailure(), 'closed');
});

test('interstitials play after side A even if the first load failed', async () => {
  const ad = fakeAdMob({ failLoads: { i: 1 } });
  _useFakeAdMob(ad, EV);
  for (const id of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8']) await maybeInterstitial(id);
  assert.equal(ad.log.filter((l) => l === 'show i').length, 0);
  // due after 2 or 3 side B clears; the failed load only pushes it one clear later
  for (const id of ['B1', 'B2', 'B3', 'B4']) await maybeInterstitial(id);
  assert.equal(ad.log.filter((l) => l === 'show i').length, 1, ad.log.join(', '));
});
