// Interstitial pacing, kept free of plugins so it can be tested in Node.
// After each clear outside the ad-free sides, a countdown drops by one; at zero
// an interstitial is due and the countdown restarts at a random gap.

export function nextGap([min, max], rand = Math.random) {
  return min + Math.floor(rand() * (max - min + 1));
}

// Returns whether an interstitial is due after clearing levelId, and the
// countdown to store. countdown is null before the first counted clear.
export function pace({ levelId, countdown, now, lastAt, rules, rand = Math.random }) {
  if (rules.freeSides.includes(levelId[0])) return { show: false, countdown };
  const left = (countdown ?? nextGap(rules.every, rand)) - 1;
  if (left > 0 || now - lastAt < rules.minGapMs) return { show: false, countdown: left };
  return { show: true, countdown: nextGap(rules.every, rand) };
}
