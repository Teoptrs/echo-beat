// Player progress, persisted in the WebView's localStorage.

const KEY = 'echobeat.save.v1';

const DEFAULTS = {
  coins: 0,
  progress: {}, // levelId -> { stars, best } once cleared
  clears: 0, // level clears
  adCountdown: null, // counted clears left before the next interstitial
  deaths: 0,
  ink: 'standard',
  owned: ['standard'],
  adProgress: {}, // inkId -> rewarded ads watched toward an ad-unlock
  adsRemoved: false,
  premiumInks: false,
  grantedTx: [], // consumable purchase transaction ids already credited
  hints: [], // level ids whose hint has been unlocked
  freeHintAt: 0, // when the last free hint was used (ms)
  seen: [], // intro cards and tutorials already shown
  music: 0.8,
  sfx: 0.9,
  haptics: true,
  offsetMs: 0, // audio delay calibration
  daily: { last: null, streak: 0 },
  freeCoins: { day: null, count: 0 },
};

export const save = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...structuredClone(DEFAULTS), ...JSON.parse(raw) };
  } catch {
    // corrupt or unavailable storage: start fresh
  }
  return structuredClone(DEFAULTS);
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // storage full or blocked; progress lives in memory for this session
  }
}

export function resetSave() {
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, structuredClone(DEFAULTS));
  persist();
}

export function addCoins(n) {
  save.coins = Math.max(0, save.coins + Math.round(n));
  persist();
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayDiff(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

export const DAILY_REWARDS = [20, 30, 40, 50, 75, 100, 200];

// Which day of the 7-day streak is claimable today, or null if already claimed.
export function dailyStatus() {
  const t = today();
  const { last, streak } = save.daily;
  if (last === t) return { claimable: false, day: streak };
  const continues = last && dayDiff(last, t) === 1;
  const day = continues ? (streak % DAILY_REWARDS.length) + 1 : 1;
  return { claimable: true, day };
}

export function claimDaily(multiplier = 1) {
  const st = dailyStatus();
  if (!st.claimable) return 0;
  const amount = DAILY_REWARDS[st.day - 1] * multiplier;
  save.daily = { last: today(), streak: st.day };
  addCoins(amount);
  return amount;
}
