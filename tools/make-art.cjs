// Renders the app icon, splash and store art from tools/art.html with Playwright.
// Needs the dev server running: npx vite --port 5180
// Then run: node tools/make-art.cjs && npx capacitor-assets generate --android
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const BASE = process.env.ART_URL || 'http://127.0.0.1:5180';
const jobs = [
  ['assets/icon-only.png', 'icon', 1024, 1024],
  ['assets/icon-foreground.png', 'icon-fg', 1024, 1024],
  ['assets/icon-background.png', 'icon-bg', 1024, 1024],
  ['assets/splash.png', 'splash', 2732, 2732],
  ['assets/splash-dark.png', 'splash', 2732, 2732, 'night'],
  ['store-listing/icon-512.png', 'icon', 512, 512],
  ['store-listing/feature-graphic-1024x500.png', 'feature', 1024, 500],
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  for (const [out, kind, w, h, ink] of jobs) {
    await p.setViewportSize({ width: Math.min(w, 4000), height: Math.min(h, 4000) });
    await p.goto(`${BASE}/tools/art.html?kind=${kind}&w=${w}&h=${h}${ink ? `&ink=${ink}` : ''}`);
    await p.waitForFunction(() => document.title === 'done', null, { timeout: 30000 });
    await p.locator('#c').screenshot({ path: out, omitBackground: kind === 'icon-fg' });
    console.log('wrote', out);
  }
  await b.close();
})();
