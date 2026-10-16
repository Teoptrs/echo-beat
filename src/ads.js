// AdMob wrapper: rewarded ads (opt-in, player-triggered) and paced interstitials.
// In a desktop browser the plugin is unavailable, so a stand-in "test ad"
// overlay is shown instead; everything else behaves the same.
import { Capacitor } from '@capacitor/core';
import { ADS } from './config.js';
import { save, persist } from './save.js';
import { mockAd } from './mock.js';
import { pace } from './pacing.js';

let native = Capacitor.isNativePlatform();
let AdMob, RewardEv, InterEv;
let rewardedReady = false;
let interstitialReady = false;
let rewardedLoad = null; // the load in flight, so two callers never start two
let interstitialLoad = null;
const retryTimers = {};
let lastInterstitialAt = -Infinity;
let canRequestAds = !native;
let failure = null;
export let privacyOptionsRequired = false;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function initAds() {
  if (!native) return;
  try {
    const mod = await import('@capacitor-community/admob');
    ({ AdMob, RewardAdPluginEvents: RewardEv, InterstitialAdPluginEvents: InterEv } = mod);

    // EU/UK users must see Google's consent form (UMP) before ads are requested.
    // The form's text is configured in AdMob > Privacy & messaging.
    const info = await AdMob.requestConsentInfo();
    let consent = info;
    if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) {
      consent = await AdMob.showConsentForm();
    }
    canRequestAds = consent.canRequestAds;
    privacyOptionsRequired = consent.privacyOptionsRequirementStatus === mod.PrivacyOptionsRequirementStatus.REQUIRED;

    await AdMob.initialize({ initializeForTesting: ADS.testing, maxAdContentRating: mod.MaxAdContentRating.General });
    loadRewarded();
    loadInterstitial();
  } catch (e) {
    console.warn('Ads unavailable', e);
  }
}

// A failed load (no fill, no network yet) is tried again later instead of
// leaving that ad type dead for the rest of the session.
function retryLater(kind, load) {
  if (retryTimers[kind]) return;
  retryTimers[kind] = setTimeout(() => {
    retryTimers[kind] = null;
    load();
  }, 30_000);
  retryTimers[kind].unref?.(); // (Node tests) don't hold the process open
}

function loadRewarded() {
  if (!AdMob || !canRequestAds) return Promise.resolve(false);
  if (rewardedReady) return Promise.resolve(true);
  rewardedLoad ??= AdMob.prepareRewardVideoAd({ adId: ADS.rewarded, isTesting: ADS.testing })
    .then(() => (rewardedReady = true))
    .catch((e) => {
      console.warn('Rewarded ad failed to load', e);
      retryLater('rewarded', loadRewarded);
      return false;
    })
    .finally(() => (rewardedLoad = null));
  return rewardedLoad;
}

function loadInterstitial() {
  if (!AdMob || !canRequestAds || save.adsRemoved) return Promise.resolve(false);
  if (interstitialReady) return Promise.resolve(true);
  interstitialLoad ??= AdMob.prepareInterstitial({ adId: ADS.interstitial, isTesting: ADS.testing })
    .then(() => (interstitialReady = true))
    .catch((e) => {
      console.warn('Interstitial failed to load', e);
      retryLater('interstitial', loadInterstitial);
      return false;
    })
    .finally(() => (interstitialLoad = null));
  return interstitialLoad;
}

// Shows a full-screen ad and resolves once it is closed. `events` maps plugin
// event names to handlers; listeners are attached before the ad is shown.
async function present(show, ev, events) {
  let finish;
  const closed = new Promise((r) => (finish = r));
  const handles = await Promise.all([
    ...Object.entries(events).map(([name, fn]) => AdMob.addListener(name, fn)),
    AdMob.addListener(ev.Dismissed, () => finish('closed')),
    AdMob.addListener(ev.FailedToShow, () => finish('failed')),
  ]);
  show().catch(() => finish('failed'));
  const how = await closed;
  handles.forEach((h) => h.remove());
  return how;
}

export function rewardedAvailable() {
  return !native || (canRequestAds && !!AdMob);
}

// Why the last rewarded ad gave nothing: 'closed' (skipped before the end) or
// 'unavailable' (none could be loaded).
export function rewardFailure() {
  return failure;
}

// Shows a rewarded ad; resolves true only if the player earned the reward.
export async function showRewarded() {
  failure = null;
  if (!native) {
    const ok = await mockAd('rewarded');
    if (!ok) failure = 'closed';
    return ok;
  }
  if (!AdMob || !canRequestAds) {
    failure = 'unavailable';
    return false;
  }
  if (!rewardedReady) await Promise.race([loadRewarded(), wait(8000)]);
  if (!rewardedReady) {
    failure = 'unavailable';
    return false;
  }
  rewardedReady = false; // this one is used up once shown
  let earned = false;
  const how = await present(() => AdMob.showRewardVideoAd(), RewardEv, { [RewardEv.Rewarded]: () => (earned = true) });
  loadRewarded(); // get the next one ready
  if (!earned) failure = how === 'failed' ? 'unavailable' : 'closed';
  return earned;
}

// Called when leaving a cleared level; shows an interstitial only when pacing allows.
export async function maybeInterstitial(levelId) {
  if (save.adsRemoved) return;
  const r = pace({ levelId, countdown: save.adCountdown, now: Date.now(), lastAt: lastInterstitialAt, rules: ADS.interstitial });
  if (!r.show) {
    save.adCountdown = r.countdown;
    persist();
    return;
  }
  if (native) {
    // give a load in progress a moment; if there's still no ad, it stays due for the next clear
    if (!interstitialReady) await Promise.race([loadInterstitial(), wait(1500)]);
    if (!AdMob || !interstitialReady) {
      save.adCountdown = 0;
      persist();
      loadInterstitial();
      return;
    }
  }
  save.adCountdown = r.countdown;
  persist();
  lastInterstitialAt = Date.now();
  if (!native) {
    await mockAd('interstitial');
    return;
  }
  interstitialReady = false;
  await present(() => AdMob.showInterstitial(), InterEv, {});
  loadInterstitial();
}

export async function showPrivacyOptions() {
  if (AdMob) await AdMob.showPrivacyOptionsForm().catch(() => {});
}

// Tests run the native code path against a fake plugin.
export function _useFakeAdMob(fake, events) {
  native = true;
  AdMob = fake;
  ({ RewardAdPluginEvents: RewardEv, InterstitialAdPluginEvents: InterEv } = events);
  canRequestAds = true;
  rewardedReady = interstitialReady = false;
  rewardedLoad = interstitialLoad = null;
  lastInterstitialAt = -Infinity;
}

// Used when Remove Ads is bought so a preloaded interstitial is never shown.
export function onAdsRemoved() {
  save.adsRemoved = true;
  interstitialReady = false;
  persist();
}
