// Monetization settings. Real AdMob unit ids come from build-time env vars
// (see .env.example); without them the app uses Google's official test ads,
// which are safe to click and never earn or risk your account.

const env = import.meta.env || {};

const TEST_UNITS = {
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
};

export const ADS = {
  rewarded: env.VITE_ADMOB_REWARDED_ID || TEST_UNITS.rewarded,
  interstitial: env.VITE_ADMOB_INTERSTITIAL_ID || TEST_UNITS.interstitial,
  testing: !env.VITE_ADMOB_REWARDED_ID,
  // Interstitial pacing: only between levels (never after a death), never
  // during a player's first clears, then at most every few clears and never
  // more often than the minimum gap.
  interstitialGraceRuns: 6,
  interstitialEvery: 3,
  interstitialMinGapMs: 90_000,
  freeCoinsPerAd: 25,
  freeCoinsAdsPerDay: 5,
  hintCost: 40, // coins, or one rewarded ad
};

// Coins for clearing a level: a bonus the first time, plus 5 per new star.
export const REWARDS = { firstClear: 10, perStar: 5 };

// Product ids must match what you create in Play Console > Monetize > Products.
export const PRODUCTS = [
  { id: 'remove_ads', type: 'NON_CONSUMABLE', title: 'Remove Ads', desc: 'No more interstitial ads. Forever.', fallbackPrice: '€2.99' },
  { id: 'premium_inks', type: 'NON_CONSUMABLE', title: 'Premium Inks', desc: 'Night Print, Kraft and Gold Foil.', fallbackPrice: '€1.99' },
  { id: 'coins_500', type: 'CONSUMABLE', title: '500 Coins', desc: 'Enough for a dozen hints.', coins: 500, fallbackPrice: '€0.99' },
  { id: 'coins_2000', type: 'CONSUMABLE', title: '2,000 Coins', desc: 'Four times the coins.', coins: 2000, fallbackPrice: '€2.99' },
];

export const PRIVACY_POLICY_URL = env.VITE_PRIVACY_POLICY_URL || 'https://teoptrs.github.io/echo-beat/privacy-policy.html';
