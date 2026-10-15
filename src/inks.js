// Ink sets: the game is drawn like a risograph print, a few spot inks
// overprinted on paper. Swapping the ink set is the cosmetic you unlock.
//   paper   background stock
//   you     your ink        echo   your echoes (overprints where they cross)
//   note    notes / beat flashes   line   walls, outlines, text
//   danger  spikes                 mech   plates & gates
//   blend   'multiply' for light paper, 'screen' for dark paper
// unlock: null (free) | { coins } | { ads } | { iap }

export const INKS = [
  { id: 'standard', name: 'Standard', unlock: null, paper: '#e9e8e1', you: '#0078bf', echo: '#ff48b0', note: '#ffe800', line: '#24222c', danger: '#f15060', mech: '#00a95c', blend: 'multiply' },
  { id: 'teal', name: 'Teal & Orange', unlock: { coins: 250 }, paper: '#ecebe6', you: '#00838a', echo: '#ff6c2f', note: '#ffe800', line: '#2a2a2a', danger: '#d1365a', mech: '#5ec8e5', blend: 'multiply' },
  { id: 'grape', name: 'Grape', unlock: { coins: 400 }, paper: '#e8e6e8', you: '#765ba7', echo: '#ffb511', note: '#9fd25e', line: '#2b2433', danger: '#ff4c65', mech: '#00a95c', blend: 'multiply' },
  { id: 'news', name: 'Newsprint', unlock: { ads: 3 }, paper: '#e4e2dc', you: '#24222c', echo: '#9a9892', note: '#f15060', line: '#24222c', danger: '#f15060', mech: '#5c5a62', blend: 'multiply' },
  { id: 'moss', name: 'Moss', unlock: { coins: 600 }, paper: '#e7e8df', you: '#407060', echo: '#ff665e', note: '#ffd900', line: '#2b2d29', danger: '#bd4f3c', mech: '#3d5588', blend: 'multiply' },
  { id: 'night', name: 'Night Print', unlock: { iap: 'premium_inks' }, paper: '#16151c', you: '#3ec5ff', echo: '#ff48b0', note: '#ffe800', line: '#d9d6e3', danger: '#ff5a5a', mech: '#44d07b', blend: 'screen' },
  { id: 'kraft', name: 'Kraft', unlock: { iap: 'premium_inks' }, paper: '#c9a77c', you: '#1f3f8f', echo: '#c2185b', note: '#fff3c4', line: '#2a1c12', danger: '#9e1b1b', mech: '#2e6b3a', blend: 'multiply' },
  { id: 'gold', name: 'Gold Foil', unlock: { iap: 'premium_inks' }, paper: '#1d1b18', you: '#e6c56b', echo: '#8f7b4a', note: '#fff1c1', line: '#e9dcc0', danger: '#d96b4c', mech: '#7fb08f', blend: 'screen' },
];

export const PREMIUM_INKS = INKS.filter((i) => i.unlock?.iap).map((i) => i.id);
export const inkById = (id) => INKS.find((i) => i.id === id) || INKS[0];

// rgba() from a hex color
export function rgba(hex, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Seeded noise so the paper doesn't shimmer between frames or reloads.
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

// Paper stock: base color, fine grain and a few fibres.
export function paperCanvas(w, h, ink, dpr = 1) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d');
  g.fillStyle = ink.paper;
  g.fillRect(0, 0, c.width, c.height);
  const r = rng(7);
  const dark = ink.blend === 'screen';
  const count = (c.width * c.height) / 90;
  for (let i = 0; i < count; i++) {
    const v = r();
    g.fillStyle = dark ? `rgba(255,255,255,${v * 0.05})` : `rgba(60,50,40,${v * 0.06})`;
    g.fillRect(r() * c.width, r() * c.height, 1 + (v > 0.97 ? 1 : 0), 1);
  }
  g.strokeStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(80,70,60,0.05)';
  g.lineWidth = dpr * 0.6;
  for (let i = 0; i < (w * h) / 9000; i++) {
    const x = r() * c.width, y = r() * c.height, a = r() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * 9 * dpr, y + Math.sin(a) * 9 * dpr, x + Math.cos(a + 0.4) * 18 * dpr, y + Math.sin(a + 0.4) * 18 * dpr);
    g.stroke();
  }
  return c;
}

// Paper-colored specks laid over the inks so coverage looks uneven, like a real print.
export function grainCanvas(w, h, ink, dpr = 1) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d');
  const r = rng(11);
  const count = (c.width * c.height) / 28;
  g.fillStyle = rgba(ink.paper, 0.32);
  for (let i = 0; i < count; i++) g.fillRect(r() * c.width, r() * c.height, dpr, dpr);
  g.fillStyle = rgba(ink.paper, 0.6);
  for (let i = 0; i < count / 12; i++) g.fillRect(r() * c.width, r() * c.height, dpr * 1.5, dpr * 1.5);
  return c;
}

// Patterns are drawn at device resolution, then scaled back so they stay crisp.
function pattern(ctx, c, scale) {
  const p = ctx.createPattern(c, 'repeat');
  if (scale !== 1 && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(1 / scale));
  return p;
}

// Halftone dot tile, used to shade floor tiles.
export function halftone(ctx, color, spacing = 7, radius = 1.15, scale = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(spacing * 2 * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.fillStyle = color;
  for (const [x, y] of [[spacing / 2, spacing / 2], [spacing * 1.5, spacing * 1.5]]) {
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
  }
  return pattern(ctx, c, scale);
}

// Diagonal hatching tile, used for walls and closed gates.
export function hatch(ctx, color, spacing = 5, width = 1.6, scale = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(spacing * 4 * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.strokeStyle = color;
  g.lineWidth = width;
  for (let i = -4; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * spacing, 0);
    g.lineTo(i * spacing + spacing * 4, spacing * 4);
    g.stroke();
  }
  return pattern(ctx, c, scale);
}

// A small data-URI paper texture for the DOM screens.
export function paperDataUrl(ink) {
  const c = paperCanvas(220, 220, ink, 1);
  return c.toDataURL('image/png');
}
