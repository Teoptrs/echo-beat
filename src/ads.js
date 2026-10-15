// AdMob wrapper: rewarded ads (opt-in, player-triggered) and paced interstitials.
// In a desktop browser the plugin is unavailable, so a stand-in "test ad"
// overlay is shown instead; everything else behaves the same.
import { Capacitor } from '@capacitor/core';
import { ADS } from './config.js';
import { save, persist } from './save.js';
import { mockAd } from './mock.js';

const native = Capacitor.isNativePlatform();
let AdMob, RewardEv, InterEv;
let rewardedReady = false;
let interstitialReady = false;
let lastInterstitialAt = 0;
let clearsSinceInterstitial = 0;
let canRequestAds = !native;
export let privacyOptionsRequired = false;

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

    AdMob.addListener(RewardEv.Dismissed, () => {
      rewardedReady = false;
      preloadRewarded();
    });
    AdMob.addListener(InterEv.Dismissed, () => {
      interstitialReady = false;
      preloadInterstitial();
    });
    preloadRewarded();
    preloadInterstitial();
  } catch (e) {
    console.warn('Ads unavailable', e);
  }
}

async function preloadRewarded() {
  if (!AdMob || !canRequestAds || rewardedReady) return;
  try {
    await AdMob.prepareRewardVideoAd({ adId: ADS.rewarded, isTesting: ADS.testing });
    rewardedReady = true;
  } catch {
    rewardedReady = false;
  }
}

async function preloadInterstitial() {
  if (!AdMob || !canRequestAds || save.adsRemoved || interstitialReady) return;
  try {
    await AdMob.prepareInterstitial({ adId: ADS.interstitial, isTesting: ADS.testing });
    interstitialReady = true;
  } catch {
    interstitialReady = false;
  }
}

export function rewardedAvailable() {
  return !native || (canRequestAds && !!AdMob);
}

// Shows a rewarded ad; resolves true only if the player earned the reward.
export async function showRewarded() {
  if (!native) return mockAd('rewarded');
  if (!AdMob || !canRequestAds) return false;
  if (!rewardedReady) {
    await Promise.race([preloadRewarded(), new Promise((r) => setTimeout(r, 6000))]);
    if (!rewardedReady) return false;
  }
  return new Promise((resolve) => {
    let earned = false;
    const handles = [];
    const done = (value) => {
      handles.forEach((h) => h.then((x) => x.remove()));
      resolve(value);
    };
    handles.push(AdMob.addListener(RewardEv.Rewarded, () => (earned = true)));
    handles.push(AdMob.addListener(RewardEv.Dismissed, () => done(earned)));
    handles.push(AdMob.addListener(RewardEv.FailedToShow, () => done(false)));
    AdMob.showRewardVideoAd().catch(() => done(false));
  });
}

// Called when leaving a cleared level; shows an interstitial only when pacing allows.
export async function maybeInterstitial() {
  clearsSinceInterstitial++;
  if (save.adsRemoved) return;
  if (save.clears <= ADS.interstitialGraceRuns) return;
  if (clearsSinceInterstitial < ADS.interstitialEvery) return;
  if (Date.now() - lastInterstitialAt < ADS.interstitialMinGapMs) return;
  clearsSinceInterstitial = 0;
  lastInterstitialAt = Date.now();
  if (!native) {
    await mockAd('interstitial');
    return;
  }
  if (!AdMob || !interstitialReady) return;
  await new Promise((resolve) => {
    const handles = [];
    const done = () => {
      handles.forEach((h) => h.then((x) => x.remove()));
      resolve();
    };
    handles.push(AdMob.addListener(InterEv.Dismissed, done));
    handles.push(AdMob.addListener(InterEv.FailedToShow, done));
    AdMob.showInterstitial().catch(done);
  });
}

export async function showPrivacyOptions() {
  if (AdMob) await AdMob.showPrivacyOptionsForm().catch(() => {});
}

// Used when Remove Ads is bought so a preloaded interstitial is never shown.
export function onAdsRemoved() {
  save.adsRemoved = true;
  interstitialReady = false;
  persist();
}
