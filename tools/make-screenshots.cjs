// Store screenshots (1080×1920) taken from real play, with an autoplayer that
// follows each level's hint route. Needs the dev server: npx vite --port 5180
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const BASE = process.env.SHOT_URL || 'http://127.0.0.1:5180/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [file, level, beats to play before the shot, ink]
const PLAYS = [
  ['store-listing/screenshot-2-pillar.png', 'A6', 15, 'standard'],
  ['store-listing/screenshot-3-relay.png', 'B7', 13, 'standard'],
  ['store-listing/screenshot-4-finale.png', 'C8', 11, 'kraft'],
  ['store-listing/screenshot-5-night.png', 'C4', 10, 'night'],
];

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
  await p.goto(BASE);
  // a player who has been through most of the record
  await p.evaluate(() => {
    const s = __eb.save;
    for (const l of __eb.LEVELS.slice(0, 19)) s.progress[l.id] = { stars: l.id === 'B3' || l.id === 'C2' ? 2 : 3, best: 10 };
    s.coins = 340;
    s.owned = ['standard', 'teal', 'kraft', 'night', 'gold'];
    s.seen = ['intro:wait', 'intro:gate', 'intro:spikes', 'intro:crumble', 'intro:metronome', 'intro:teleport', 'intro:eraser', 'tut:echo'];
    s.daily = { last: new Date().toISOString().slice(0, 10), streak: 2 };
    __eb.persist();
  });
  await p.reload();
  await sleep(600);
  await p.mouse.click(10, 300);
  await sleep(1500);
  await p.screenshot({ path: 'store-listing/screenshot-1-title.png' });

  for (const [file, id, beats, ink] of PLAYS) {
    await p.evaluate((ink) => {
      __eb.save.ink = ink;
      __eb.persist();
    }, ink);
    await p.reload();
    await sleep(500);
    await p.mouse.click(10, 300);
    await p.evaluate(() => (window.__auto = setInterval(() => {
      const pl = __eb.play;
      if (!pl || pl.mode !== 'play') return;
      const route = __eb.SOLUTIONS[pl.level.id].route;
      const n = pl.nextTick;
      if (n < pl.goBeat || pl.queued !== null || pl.sim.movedBeat === n) return;
      const a = route[n - 4];
      if (a === undefined || a < 0) return;
      if (pl.t0 + n * pl.spb - __eb.clock() < pl.spb * 0.55) __eb.swipe(a);
    }, 8)));
    await p.evaluate((id) => __eb.startLevel(__eb.LEVELS.findIndex((l) => l.id === id)), id);
    for (let i = 0; i < 400; i++) {
      const st = await p.evaluate(() => {
        const pl = __eb.play;
        return { used: pl.sim.beatsUsed, phase: ((__eb.clock() - pl.t0) / pl.spb) % 1 };
      });
      if (st.used >= beats && st.phase > 0.3 && st.phase < 0.6) break;
      await sleep(15);
    }
    await p.screenshot({ path: file });
    console.log('wrote', file);
  }

  await p.evaluate(() => {
    __eb.save.ink = 'standard';
    __eb.persist();
  });
  await p.reload();
  await sleep(500);
  await p.evaluate(() => __eb.show('tracks'));
  await p.click('[data-side="C"]');
  await sleep(400);
  await p.screenshot({ path: 'store-listing/screenshot-6-tracklist.png' });
  await p.evaluate(() => __eb.show('shop'));
  await sleep(400);
  await p.screenshot({ path: 'store-listing/screenshot-7-inks.png' });
  // leave a clean save behind
  await p.evaluate(() => localStorage.clear());
  await b.close();
})();
