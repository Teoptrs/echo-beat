// Echo Beat: screens, game flow, tutorial, hints, shop and monetization.
import '@fontsource/dela-gothic-one/latin-400.css';
import '@fontsource-variable/archivo/wdth.css';
import './style.css';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LEVELS, SIDES, INTROS } from './levels.js';
import SOLUTIONS from './solutions.json';
import { DIRS, starsFor } from './sim.js';
import { Play } from './play.js';
import { Renderer } from './render.js';
import * as audio from './music.js';
import { INKS, inkById, paperDataUrl } from './inks.js';
import { save, persist, addCoins, dailyStatus, claimDaily, DAILY_REWARDS, today } from './save.js';
import { ADS, REWARDS, PRIVACY_POLICY_URL } from './config.js';
import { initAds, showRewarded, maybeInterstitial, rewardedAvailable, showPrivacyOptions, privacyOptionsRequired } from './ads.js';
import { initIAP, buy, restore, priceOf, owns } from './iap.js';

const native = Capacitor.isNativePlatform();
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- icons (drawn, never emoji) ----------

const ICON = {
  coin: '<svg viewBox="0 0 20 20" aria-hidden="true"><path class="i-fill-note i-stroke" stroke-width="2" d="M10 1.6 17.3 5.8v8.4L10 18.4 2.7 14.2V5.8z"/><path class="i-stroke i-nofill" stroke-width="1.6" d="M10 6.3l3.2 1.85v3.7L10 13.7l-3.2-1.85v-3.7z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-fill-line" d="M10 1h4l.6 3.1 2 .9 2.7-1.8 2.8 2.8-1.8 2.7.9 2 3.1.6v4l-3.1.6-.9 2 1.8 2.7-2.8 2.8-2.7-1.8-2 .9L14 23h-4l-.6-3.1-2-.9-2.7 1.8-2.8-2.8 1.8-2.7-.9-2L-.3 14v-4l3.1-.6.9-2L1.9 4.7l2.8-2.8 2.7 1.8 2-.9z" transform="translate(.3 0) scale(.98)"/><circle cx="12" cy="12" r="3.6" style="fill:var(--paper)"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-stroke i-nofill" stroke-width="3" stroke-linecap="square" d="M20 12H5m6-7-7 7 7 7"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-fill-line" d="M5 3h5v18H5zm9 0h5v18h-5z"/></svg>',
  ad: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="i-stroke i-nofill" stroke-width="2.4" x="2" y="4" width="20" height="14"/><path class="i-fill-line" d="M10 7.5v7l6-3.5z"/><path class="i-stroke i-nofill" stroke-width="2.4" d="M8 21h8"/></svg>',
  route: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-stroke i-nofill" stroke-width="2.6" stroke-dasharray="1 4" stroke-linecap="round" d="M4 20c2-6 8-4 9-9s5-6 7-7"/><circle class="i-fill-note i-stroke" stroke-width="2" cx="20" cy="4" r="3"/></svg>',
  slow: '<svg viewBox="0 0 20 20" aria-hidden="true"><path class="i-fill-note" d="M6.6 16.6c.9-1.9 2.2-2.6 3.4-2.6s2.5.7 3.4 2.6z"/><path class="i-stroke i-nofill" stroke-width="2" d="M3.5 1.8h13M3.5 18.2h13M5.4 1.8c0 5.3 4.6 5.6 4.6 8.2s-4.6 2.9-4.6 8.2M14.6 1.8c0 5.3-4.6 5.6-4.6 8.2s4.6 2.9 4.6 8.2"/></svg>',
  note: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="i-fill-note" cx="10" cy="10" r="9.5"/><ellipse style="fill:var(--on-note)" cx="7.7" cy="13.3" rx="2.6" ry="1.9" transform="rotate(-22 7.7 13.3)"/><path class="i-nofill" style="stroke:var(--on-note)" stroke-width="1.6" d="M10 13V4.5c.5 2.8 4.5 2.4 3.6 6"/></svg>',
};

const star = (on) => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.85 6.1 6.65.75-4.95 4.55 1.35 6.6L12 17.3l-5.9 3.3 1.35-6.6L2.5 9.45l6.65-.75z"/></svg>`;

function paintIcons(root = document) {
  for (const el of $$('[data-icon]', root)) el.innerHTML = ICON[el.dataset.icon] || '';
}

// ---------- state ----------

const canvas = $('#stage');
const renderer = new Renderer(canvas);
let screen = 'title';
let history = [];
let play = null;
let levelIdx = 0;
let tutorial = null;
let slowFor = null; // id of the track the slow tempo power-up is on
let menuSong = null;
let dirty = true;
let ink = inkById(save.ink);

const SIDE_STYLE = { A: 'dub', B: 'machine', C: 'noise' };
const KEYS = [0, 3, -2, 5, -4, 2, -5, 1];

const levelIndex = (id) => LEVELS.findIndex((l) => l.id === id);
const cleared = (i) => !!save.progress[LEVELS[i]?.id];
const unlocked = (i) => i === 0 || cleared(i) || cleared(i - 1);
const nextIndex = () => {
  const i = LEVELS.findIndex((_, j) => !cleared(j));
  return i < 0 ? -1 : i;
};
const totalStars = () => LEVELS.reduce((a, l) => a + (save.progress[l.id]?.stars || 0), 0);

// ---------- inks ----------

function stampMask() {
  // speckled alpha mask so stamps look hand-inked
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 160, 160);
  g.globalCompositeOperation = 'destination-out';
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) g.fillRect(r() * 160, r() * 160, 1 + r() * 2, 1 + r() * 1.5);
  return c.toDataURL();
}

function applyInk(id) {
  ink = inkById(id);
  const st = document.documentElement.style;
  for (const k of ['paper', 'line', 'you', 'echo', 'note', 'danger', 'mech']) st.setProperty('--' + k, ink[k]);
  st.setProperty('--blend', ink.blend);
  st.setProperty('--on-note', ink.blend === 'screen' ? ink.paper : ink.line);
  st.setProperty('--paper-img', `url(${paperDataUrl(ink)})`);
  $('meta[name="theme-color"]').setAttribute('content', ink.paper);
  $('#ink-name').textContent = ink.name;
  renderer.setInk(ink);
  dirty = true;
}

// ---------- navigation ----------

function show(name, { push = true } = {}) {
  if (push && name !== screen) history.push(screen);
  screen = name;
  for (const el of $$('[data-screen]')) el.hidden = el.id !== name;
  if (name === 'title') renderTitle();
  if (name === 'tracks') renderTracks();
  if (name === 'shop') renderShop();
  if (name === 'settings') renderSettings();
  if (name !== 'play') {
    play = null;
    ensureMenuMusic();
  }
  updateCoins();
  dirty = true;
}

function back() {
  if (!$('#sheet').hidden) {
    sheetBack?.();
    return;
  }
  if (screen === 'play') return pauseGame();
  if (screen === 'title') {
    if (native) App.exitApp();
    return;
  }
  show(history.pop() || 'title', { push: false });
}

function quitToTracks() {
  slowFor = null;
  closeSheet();
  audio.stopSong(0.2);
  history = ['title'];
  show('tracks', { push: false });
}

// ---------- sheets and toasts ----------

let sheetBack = null;

function openSheet(html, { cls = '', onBack = closeSheet } = {}) {
  const sheet = $('#sheet');
  const panel = $('.sheet-panel', sheet);
  panel.className = 'sheet-panel ' + cls;
  panel.innerHTML = html;
  paintIcons(panel);
  sheet.hidden = false;
  sheetBack = onBack;
  panel.scrollTop = 0;
  return panel;
}

function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet').classList.remove('top');
  sheetBack = null;
}

$('#sheet').addEventListener('click', (e) => {
  if (e.target.id === 'sheet') sheetBack?.();
});

let toastTimer = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2400);
}

function updateCoins() {
  for (const el of $$('[data-coins]')) el.textContent = save.coins.toLocaleString('en');
}

// ---------- audio and haptics ----------

let Haptics = null;
if (native) import('@capacitor/haptics').then((m) => (Haptics = m)).catch(() => {});

function buzz(kind) {
  if (!save.haptics || !Haptics) return;
  const { Haptics: H, ImpactStyle, NotificationType } = Haptics;
  if (kind === 'win') H.notification({ type: NotificationType.Success }).catch(() => {});
  else H.impact({ style: { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }[kind] }).catch(() => {});
}

function ensureMenuMusic() {
  if (!audio.audioReady() || menuSong || screen === 'play') return;
  const spb = 60 / 94;
  const t0 = audio.clock() + 0.15;
  menuSong = { t0, spb };
  audio.startSong({ t0, spb, from: 0, firstBeat: 0, countIn: 0, clicks: false, style: 'dub', key: -3, layers: 2 });
}

function stopMenuMusic() {
  if (!menuSong) return;
  audio.stopSong(0.15);
  menuSong = null;
}

function menuBeat() {
  const now = audio.audioReady() ? audio.clock() : performance.now() / 1000;
  const spb = menuSong?.spb || 60 / 94;
  const beatF = menuSong ? (now - menuSong.t0) / spb : now / spb;
  const ph = beatF - Math.floor(beatF);
  return { beatF, pulse: menuSong ? Math.max(0, 1 - ph / 0.55) : 0 };
}

// Audio can only start from a user gesture.
function unlockAudio() {
  const ac = audio.initAudio();
  if (!ac) return;
  ac.resume().then(() => setTimeout(ensureMenuMusic, 30)).catch(() => {});
}
window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
window.addEventListener('keydown', unlockAudio, { once: true, capture: true });

document.addEventListener('click', (e) => {
  if (e.target.closest('button, a')) audio.sfx('tap');
});

// ---------- title ----------

function renderTitle() {
  const i = nextIndex();
  const l = LEVELS[i < 0 ? 0 : i];
  $('#play-sub').textContent = i < 0 ? 'Every track cleared · pick any' : `${SIDES.find((s) => s.id === l.id[0]).name} · ${l.id} ${l.name}`;
  const st = dailyStatus();
  $('#daily-btn').hidden = !st.claimable;
  if (st.claimable) $('#daily-amount').textContent = '+' + DAILY_REWARDS[st.day - 1];
}

$('#play-btn').addEventListener('click', () => {
  const i = nextIndex();
  if (i < 0) show('tracks');
  else startLevel(i);
});

$('#daily-btn').addEventListener('click', showDaily);

// ---------- tracklist ----------

let sideShown = null;

function renderTracks(sideId) {
  const ni = nextIndex();
  sideShown = sideId || sideShown || (ni < 0 ? 'A' : LEVELS[ni].id[0]);
  $('#sides').innerHTML = SIDES.map((s) => {
    const first = LEVELS.findIndex((l) => l.id[0] === s.id);
    return `<button class="side-tab" role="tab" data-side="${s.id}" aria-selected="${s.id === sideShown}" aria-label="${s.name}" ${unlocked(first) ? '' : 'disabled'}>${s.id}</button>`;
  }).join('');
  const side = SIDES.find((s) => s.id === sideShown);
  const tracks = LEVELS.filter((l) => l.id[0] === sideShown);
  const stars = tracks.reduce((a, l) => a + (save.progress[l.id]?.stars || 0), 0);
  $('#side-name').textContent = `${side.name}: ${side.subtitle}`;
  $('#side-meta').textContent = `${tracks.length} tracks · ${stars} of ${tracks.length * 3} stars · ${totalStars()} of ${LEVELS.length * 3} on the record`;
  $('#tracklist').innerHTML = tracks
    .map((l) => {
      const i = levelIndex(l.id);
      const open = unlocked(i);
      const got = save.progress[l.id]?.stars || 0;
      const right = open ? `<span class="stars" aria-label="${got} stars">${[0, 1, 2].map((k) => star(k < got)).join('')}</span>` : '<span class="lock">locked</span>';
      return `<li><button class="track${i === ni ? ' next' : ''}" data-level="${i}" ${open ? '' : 'disabled'}>
        <span class="no">${l.id.slice(1).padStart(2, '0')}</span>
        <span class="name"><span>${l.name}</span></span>
        <span class="bpm">${l.bpm} bpm</span>${right}</button></li>`;
    })
    .join('');
  const lastOfSide = levelIndex(tracks[tracks.length - 1].id);
  const nextSide = SIDES[SIDES.indexOf(side) + 1];
  $('#side-foot').textContent = nextSide && !cleared(lastOfSide) ? `Clear ${tracks[tracks.length - 1].id} to flip to ${nextSide.name}: ${nextSide.subtitle}.` : '';
}

$('#sides').addEventListener('click', (e) => {
  const b = e.target.closest('[data-side]');
  if (b && !b.disabled) renderTracks(b.dataset.side);
});

$('#tracklist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-level]');
  if (b && !b.disabled) startLevel(+b.dataset.level);
});

// ---------- playing a level ----------

function layerCount() {
  const s = play.sim;
  if (!s.lv.notes.length) return 3;
  if (s.exitOpen) return 4;
  return Math.min(3, s.collected.size + 1);
}

function startLevel(i, { hint = false } = {}) {
  closeSheet();
  const level = LEVELS[i];
  const intro = level.intro && !save.seen.includes('intro:' + level.intro) ? level.intro : null;
  launch(i, hint, !!intro);
  if (intro) {
    showIntro(intro, () => {
      save.seen.push('intro:' + intro);
      persist();
      closeSheet();
      play?.begin();
    });
  }
}

function launch(i, hint, wait = false) {
  closeSheet();
  unlockAudio();
  stopMenuMusic();
  levelIdx = i;
  const level = LEVELS[i];
  if (slowFor !== level.id) slowFor = null;
  play = new Play(level, { solution: SOLUTIONS[level.id], hint, tempo: slowFor ? ADS.slowTempo : 1, onEvent });
  tutorial = null;
  if (level.tutorial === 'swipe') tutorial = { kind: 'swipe', moves: 0 };
  if (level.tutorial === 'echo' && !save.seen.includes('tut:echo')) tutorial = { kind: 'echo', shown: false };
  if (screen !== 'play') history = ['title', 'tracks'];
  screen = 'play';
  for (const el of $$('[data-screen]')) el.hidden = el.id !== 'play';
  $('#hud-id').textContent = level.id;
  $('#hud-name').textContent = level.name;
  setTip(firstTip(level, hint));
  updateHud();
  layoutBoard();
  if (!wait) play.begin();
}

function firstTip(level, hint) {
  if (hint) return 'Hint on: be on the yellow hex after each beat.';
  if (tutorial?.kind === 'swipe') return 'Swipe up, anywhere on the screen. You step on the next beat.';
  if (tutorial?.kind === 'echo') return 'Grab the note. Watch what happens.';
  return level.tip;
}

function setTip(text) {
  $('#hud-tip span').textContent = text || '';
}

function updateHud() {
  if (!play) return;
  const s = play.sim;
  const par = SOLUTIONS[play.level.id]?.par;
  const notes = $('#hud-notes');
  notes.hidden = !s.lv.notes.length;
  notes.innerHTML = `${ICON.note}<span>${s.collected.size}/${s.lv.notes.length}</span>`;
  $('#hud-beats').innerHTML = `<span>${s.beatsUsed}</span><small>${s.beatsUsed === 1 ? 'beat' : 'beats'} · par ${par}</small>`;
  const slow = $('#hud-slow');
  slow.hidden = play.tempo === 1;
  slow.innerHTML = `${ICON.slow}<small>${play.bpm} bpm</small>`;
  slow.setAttribute('aria-label', `Slow tempo, ${play.bpm} beats per minute`);
}

// Slow tempo power-up: watch a rewarded ad, and the track plays at 75% speed
// until you leave it. Never sold for coins or money.
async function unlockSlowTempo() {
  if (!(await showRewarded())) {
    toast('No reward this time. The ad was closed early.');
    return false;
  }
  slowFor = LEVELS[levelIdx].id;
  return true;
}

function safeArea() {
  const cs = getComputedStyle($('#safe-probe'));
  return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
}

function layoutBoard() {
  renderer.resize(window.innerWidth, window.innerHeight);
  const tip = $('#hud-tip').getBoundingClientRect();
  const { bottom } = safeArea();
  renderer.insets.top = (screen === 'play' ? tip.bottom : 150) + 8;
  renderer.insets.seq = bottom + 24;
  renderer.insets.bottom = renderer.insets.seq + 38 + 28;
  if (play) renderer.fit(play.sim.lv);
  dirty = true;
}

window.addEventListener('resize', layoutBoard);

function fx(type, k, extra = {}) {
  if (play) play.fx.push({ type, k, t: audio.clock(), dur: 0.5, ...extra });
}

function onEvent(type, ev) {
  if (!play) return;
  const sim = play.sim;
  switch (type) {
    case 'begin':
      audio.startSong({ t0: ev.t0, spb: play.spb, from: ev.from, firstBeat: 4, style: SIDE_STYLE[play.level.id[0]], key: KEYS[levelIdx % 8], layers: layerCount(), alt: levelIdx });
      break;
    case 'move':
      audio.sfx('step');
      buzz('light');
      if (tutorial?.kind === 'swipe') {
        tutorial.moves++;
        if (tutorial.moves === 1) setTip('Nice. Swipe again whenever you like: the step waits for the beat.');
        if (tutorial.moves === 3) setTip('The squares at the bottom keep time. Step onto the exit.');
      }
      break;
    case 'bump':
      audio.sfx('bump');
      buzz('light');
      break;
    case 'note':
      audio.sfx('note');
      buzz('medium');
      fx('ring', ev.at, { ink: 'note', dur: 0.6 });
      audio.setLayers(layerCount());
      if (sim.exitOpen) {
        fx('ring', sim.lv.exit, { ink: 'note', dur: 0.8, r0: 0.4, r1: 1.8 });
        if (!play.hint) setTip(sim.lv.notes.length > 1 ? 'Every note taken. The exit is open.' : play.level.tip);
      }
      updateHud();
      break;
    case 'teleport':
      audio.sfx('teleport');
      fx('ring', ev.from, { ink: 'you', dur: 0.4 });
      fx('ring', ev.to, { ink: 'you', dur: 0.5 });
      break;
    case 'erase':
      audio.sfx('erase');
      if (ev.echo) fx('scribble', sim.echoPos(ev.echo, play.nextTick - 1), { dur: 0.6 });
      break;
    case 'crumble':
      audio.sfx('crumble');
      fx('chips', ev.at, { dur: 0.7 });
      break;
    case 'gate':
      audio.sfx('gate');
      break;
    case 'closed':
      updateHud();
      if (tutorial?.kind === 'echo' && !tutorial.shown && sim.echoes.length) {
        tutorial.shown = true;
        play.pause();
        showEchoCallout();
      }
      break;
    case 'hintLost':
      setTip('Off the route, so the hint stopped. Restart to follow it again.');
      break;
    case 'paused':
      audio.stopSong(0.08);
      break;
    case 'dead':
      audio.crash();
      buzz('heavy');
      renderer.misprint = 1;
      play.blots = [...Array(7)].map((_, i) => ({ x: Math.cos(i * 2.4) * (i ? 0.45 : 0), y: Math.sin(i * 2.4) * (i ? 0.4 : 0), r: i ? 0.08 + (i % 3) * 0.05 : 0.38 }));
      save.deaths++;
      persist();
      setTimeout(() => showDeath(play), 650);
      break;
    case 'won':
      audio.sfx('win');
      audio.stopSong(1.2);
      buzz('win');
      fx('confetti', sim.player, { dur: 1.1 });
      setTimeout(() => showResults(play, ev.beats), 750);
      break;
  }
}

// ---------- pause, death, results ----------

function pauseGame() {
  if (!play || play.mode !== 'play') return;
  if (!play.pause()) return;
  openPause();
}

function openPause() {
  const l = play.level;
  const canSlow = play.tempo === 1 && rewardedAvailable();
  const panel = openSheet(
    `<p class="eyebrow">${l.id} · ${l.name}</p><h2>Paused</h2>
    <div class="actions">
      <button class="btn primary big" data-act="resume"><small>Four-beat count-in</small><span>Resume</span></button>
      ${canSlow ? `<button class="btn inline" data-act="slow">${ICON.ad}<span>Slow down to ${Math.round(l.bpm * ADS.slowTempo)} bpm</span></button>` : ''}
      <div class="row"><button class="btn" data-act="restart">Restart</button>
      <button class="btn inline" data-act="hint">${ICON.route}<span>${play.hint ? 'Hint is on' : 'Hint'}</span></button></div>
      <div class="row"><button class="btn" data-act="tracks">Tracklist</button>
      <button class="btn" data-act="music">${save.music > 0 ? 'Music off' : 'Music on'}</button></div>
    </div>`,
    { onBack: resumeGame },
  );
  panel.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'resume') resumeGame();
    if (act === 'slow') {
      const p = play;
      if (!(await unlockSlowTempo()) || play !== p || !p.setTempo(ADS.slowTempo)) return;
      updateHud();
      layoutBoard();
      resumeGame();
    }
    if (act === 'restart') startLevel(levelIdx, { hint: !!play.hint });
    if (act === 'hint') requestHint(openPause);
    if (act === 'tracks') quitToTracks();
    if (act === 'music') {
      save.music = save.music > 0 ? 0 : 0.8;
      persist();
      audio.setVolumes({ music: save.music });
      openPause();
    }
  };
}

function resumeGame() {
  closeSheet();
  if (play?.mode === 'paused') play.resume();
}

function showDeath(p) {
  if (play !== p || screen !== 'play' || p.mode !== 'dead') return;
  const reason = { echo: 'You walked into your own echo.', metronome: 'A metronome flattened you.', spike: 'You were standing on the spikes when they came up.' }[p.death.reason];
  const canRewind = p.canContinue && rewardedAvailable();
  const canSlow = p.tempo === 1 && rewardedAvailable();
  const panel = openSheet(
    `<span class="stamp bad">Misprint</span>
    <p class="lead">${reason}</p>
    <div class="actions">
      <button class="btn primary big" data-act="retry"><small>From the top</small><span>Retry</span></button>
      ${canRewind ? `<button class="btn inline" data-act="rewind">${ICON.ad}<span>Rewind to your last note</span></button>` : ''}
      ${canSlow ? `<button class="btn inline" data-act="slow">${ICON.ad}<span>Retry slower, at ${Math.round(p.level.bpm * ADS.slowTempo)} bpm</span></button>` : ''}
      <div class="row"><button class="btn inline" data-act="hint">${ICON.route}<span>Hint</span></button>
      <button class="btn" data-act="tracks">Tracklist</button></div>
    </div>`,
    { cls: 'death', onBack: quitToTracks },
  );
  panel.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'retry') startLevel(levelIdx, { hint: !!p.hint && !p.hint.lost });
    if (act === 'tracks') quitToTracks();
    if (act === 'hint') requestHint(() => showDeath(p));
    if (act === 'slow' && (await unlockSlowTempo()) && play === p) startLevel(levelIdx, { hint: !!p.hint && !p.hint.lost });
    if (act === 'rewind') {
      const ok = await showRewarded();
      if (!ok || play !== p) return toast('No reward this time. The ad was closed early.');
      closeSheet();
      renderer.misprint = 0;
      p.continueFromCheckpoint();
      updateHud();
    }
  };
}

function showResults(p, beats) {
  if (play !== p || screen !== 'play') return;
  const level = p.level;
  const par = SOLUTIONS[level.id].par;
  const stars = starsFor(beats, par);
  const before = save.progress[level.id];
  const gained = Math.max(0, stars - (before?.stars || 0));
  const coins = (before ? 0 : REWARDS.firstClear) + gained * REWARDS.perStar;
  save.progress[level.id] = { stars: Math.max(stars, before?.stars || 0), best: Math.min(beats, before?.best ?? Infinity) };
  save.clears++;
  persist();
  if (coins) addCoins(coins);
  updateCoins();
  const last = levelIdx === LEVELS.length - 1;
  const nextLevel = LEVELS[levelIdx + 1];
  const flips = nextLevel && nextLevel.id[0] !== level.id[0];
  const stampText = stars === 3 ? 'Perfect' : 'Clear';
  const parLine = stars === 3 ? `${beats} beats, par ${par}.` : `${beats} beats. Clear it in ${par} or fewer for three stars.`;
  const panel = openSheet(
    `<p class="eyebrow">${level.id} · ${level.name}</p>
    <span class="stamp">${stampText}</span>
    <div class="stars-big">${[0, 1, 2].map((k) => star(k < stars)).join('')}</div>
    <p class="lead">${parLine}</p>
    ${coins ? `<p class="earned">${ICON.coin}<span>+${coins}</span></p>` : ''}
    <div class="actions">
      <button class="btn primary big" data-act="next"><small>${last ? 'That was the last track' : flips ? `Flip to ${SIDES.find((s) => s.id === nextLevel.id[0]).name}` : `${nextLevel.id} ${nextLevel.name}`}</small><span>${last ? 'Tracklist' : 'Next track'}</span></button>
      <div class="row"><button class="btn" data-act="replay">Replay</button><button class="btn" data-act="tracks">Tracklist</button></div>
    </div>`,
    { onBack: quitToTracks },
  );
  audio.sfx('stamp');
  for (let k = 0; k < stars; k++) setTimeout(() => audio.sfx('star', k), 160 + k * 140);
  if (coins) setTimeout(() => audio.sfx('coin'), 600);
  panel.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    closeSheet();
    await maybeInterstitial(level.id);
    if (act === 'next' && !last) startLevel(levelIdx + 1);
    else if (act === 'replay') startLevel(levelIdx);
    else quitToTracks();
  };
}

// ---------- tutorial and intro cards ----------

function illustrate(panel, kind) {
  const c = $('.illus', panel);
  if (!c) return;
  requestAnimationFrame(() => {
    const r = new Renderer(c, { fixed: true });
    r.resize(c.clientWidth, c.clientHeight);
    r.setInk(ink);
    r.illustrate(kind);
  });
}

function showIntro(kind, done) {
  const info = INTROS[kind];
  const panel = openSheet(
    `<p class="eyebrow">New on this track</p><h2>${info.title}</h2>
    ${info.illus === false ? '' : '<canvas class="illus"></canvas>'}
    <p>${info.text}</p>
    <div class="actions"><button class="btn primary big" data-act="ok"><small>Start the track</small><span>Got it</span></button></div>`,
    { onBack: quitToTracks },
  );
  illustrate(panel, kind);
  panel.onclick = (e) => {
    if (e.target.closest('[data-act="ok"]')) done();
  };
}

function showEchoCallout() {
  const panel = openSheet(
    `<p class="eyebrow">Your echo</p><h2>That pink one is you</h2>
    <p>The note turned the route you walked to reach it into an echo. It replays that route on the beat, there and back, forever. Touch it and the take is ruined. The dashed ring shows where it steps next.</p>
    <div class="actions"><button class="btn primary" data-act="ok"><small>Four-beat count-in</small><span>Got it</span></button></div>`,
    { cls: 'callout', onBack: () => {} },
  );
  $('#sheet').classList.add('top');
  panel.onclick = (e) => {
    if (!e.target.closest('[data-act="ok"]')) return;
    save.seen.push('tut:echo');
    persist();
    closeSheet();
    setTip('Now reach the exit. Keep out of the dashed ring.');
    play?.resume();
  };
}

// ---------- hints ----------

function requestHint(goBack) {
  const level = LEVELS[levelIdx];
  if (play?.hint && !play.hint.lost) return goBack();
  if (save.hints.includes(level.id)) return startLevel(levelIdx, { hint: true });
  const cost = ADS.hintCost;
  const panel = openSheet(
    `<p class="eyebrow">${level.id} · ${level.name}</p><h2>Show the route?</h2>
    <p>A yellow hex marks where to stand after every beat. Follow it and you clear the track. The track restarts, and the hint stays unlocked for it.</p>
    <div class="actions">
      <button class="btn primary inline" data-act="coins" ${save.coins < cost ? 'disabled' : ''}>${ICON.coin}<span>Use ${cost} coins${save.coins < cost ? ` (you have ${save.coins})` : ''}</span></button>
      ${rewardedAvailable() ? `<button class="btn inline" data-act="ad">${ICON.ad}<span>Watch an ad instead</span></button>` : ''}
      <button class="btn" data-act="cancel">Not now</button>
    </div>`,
    { onBack: goBack },
  );
  panel.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cancel') goBack();
    if (act === 'coins' && save.coins >= cost) {
      addCoins(-cost);
      unlockHint(level.id);
    }
    if (act === 'ad') {
      if (await showRewarded()) unlockHint(level.id);
      else toast('No reward this time. The ad was closed early.');
    }
  };
}

function unlockHint(id) {
  if (!save.hints.includes(id)) save.hints.push(id);
  persist();
  startLevel(levelIdx, { hint: true });
}

// ---------- daily reward ----------

function showDaily() {
  const st = dailyStatus();
  if (!st.claimable) return;
  const amount = DAILY_REWARDS[st.day - 1];
  const panel = openSheet(
    `<p class="eyebrow">Daily pressing</p><h2>Day ${st.day} of 7</h2>
    <ol class="days">${DAILY_REWARDS.map((r, i) => `<li class="${i + 1 < st.day ? 'got' : i + 1 === st.day ? 'today' : ''}"><span>Day ${i + 1}</span>${r}</li>`).join('')}</ol>
    <p>Come back tomorrow to keep the streak going. Miss a day and it starts again.</p>
    <div class="actions">
      <button class="btn primary inline" data-act="claim">${ICON.coin}<span>Collect ${amount}</span></button>
      ${rewardedAvailable() ? `<button class="btn inline" data-act="double">${ICON.ad}<span>Collect ${amount * 2} with an ad</span></button>` : ''}
    </div>`,
  );
  panel.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    let mult = 1;
    if (act === 'double') {
      if (!(await showRewarded())) return toast('No reward this time. The ad was closed early.');
      mult = 2;
    }
    const got = claimDaily(mult);
    closeSheet();
    audio.sfx('coin');
    toast(`+${got} coins`);
    updateCoins();
    renderTitle();
  };
}

// ---------- shop ----------

function swatch(i) {
  const blend = i.blend === 'screen' ? 'screen' : 'multiply';
  return `<span class="swatch" style="background:${i.paper}">${[i.you, i.echo, i.note].map((c) => `<i style="background:${c};mix-blend-mode:${blend}"></i>`).join('')}</span>`;
}

function freeCoinsLeft() {
  const fc = save.freeCoins.day === today() ? save.freeCoins.count : 0;
  return ADS.freeCoinsAdsPerDay - fc;
}

function renderShop() {
  const inkRows = INKS.map((i) => {
    const has = save.owned.includes(i.id);
    let action;
    if (save.ink === i.id) action = '<span class="tag">In use</span>';
    else if (has) action = `<button class="btn small" data-ink="${i.id}">Use</button>`;
    else if (i.unlock.coins) action = `<button class="btn small inline" data-buyink="${i.id}" ${save.coins < i.unlock.coins ? 'disabled' : ''}>${ICON.coin}<span>${i.unlock.coins}</span></button>`;
    else if (i.unlock.ads) action = `<button class="btn small inline" data-adink="${i.id}" ${rewardedAvailable() ? '' : 'disabled'}>${ICON.ad}<span>${save.adProgress[i.id] || 0}/${i.unlock.ads}</span></button>`;
    else action = '<span class="tag">Premium</span>';
    const note = i.unlock?.ads && !has ? 'Watch three ads to unlock' : i.unlock?.iap && !has ? 'Part of the premium inks' : '';
    return `<div class="item">${swatch(i)}<div><h4>${i.name}</h4>${note ? `<p>${note}</p>` : ''}</div>${action}</div>`;
  }).join('');
  const product = (id, title, desc) =>
    `<div class="item no-swatch"><div><h4>${title}</h4><p>${desc}</p></div>${owns(id) ? '<span class="tag">Owned</span>' : `<button class="btn small primary" data-buy="${id}">${priceOf(id)}</button>`}</div>`;
  const left = freeCoinsLeft();
  $('#shop-body').innerHTML = `
    <p class="lede">Every ink set reprints the whole game: board, buttons and all.</p>
    <h3 class="section-label">Ink sets</h3>
    ${inkRows}
    <h3 class="section-label">Support the game</h3>
    ${product('premium_inks', 'Premium inks', 'Night Print, Kraft and Gold Foil, yours for good.')}
    ${product('remove_ads', 'Remove ads', 'No more ads between tracks. The optional reward ads stay, for when you want them.')}
    ${product('coins_500', '500 coins', 'Twelve hints, or an ink set.')}
    ${product('coins_2000', '2,000 coins', 'Four times the coins.')}
    <h3 class="section-label">Free coins</h3>
    <div class="item no-swatch"><div><h4>Watch an ad, get ${ADS.freeCoinsPerAd} coins</h4><p>${left > 0 ? `${left} left today` : 'Back tomorrow'}</p></div>
    <button class="btn small inline" data-free ${left > 0 && rewardedAvailable() ? '' : 'disabled'}>${ICON.ad}<span>+${ADS.freeCoinsPerAd}</span></button></div>
    <p class="help" style="margin-top:18px">${ADS.testing ? 'Ads in this build are Google test ads. ' : ''}Purchases go through Google Play.</p>`;
  updateCoins();
}

$('#shop-body').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.ink) {
    save.ink = b.dataset.ink;
    persist();
    applyInk(save.ink);
  } else if (b.dataset.buyink) {
    const i = inkById(b.dataset.buyink);
    if (save.coins < i.unlock.coins) return;
    addCoins(-i.unlock.coins);
    save.owned.push(i.id);
    save.ink = i.id;
    persist();
    applyInk(i.id);
    toast(`${i.name} unlocked`);
  } else if (b.dataset.adink) {
    const i = inkById(b.dataset.adink);
    if (!(await showRewarded())) return toast('No reward this time. The ad was closed early.');
    save.adProgress[i.id] = (save.adProgress[i.id] || 0) + 1;
    if (save.adProgress[i.id] >= i.unlock.ads) {
      save.owned.push(i.id);
      save.ink = i.id;
      applyInk(i.id);
      toast(`${i.name} unlocked`);
    }
    persist();
  } else if (b.dataset.buy) {
    const err = await buy(b.dataset.buy);
    if (err) toast(err);
  } else if ('free' in b.dataset) {
    if (!(await showRewarded())) return toast('No reward this time. The ad was closed early.');
    const fc = save.freeCoins.day === today() ? save.freeCoins.count : 0;
    save.freeCoins = { day: today(), count: fc + 1 };
    addCoins(ADS.freeCoinsPerAd);
    audio.sfx('coin');
    toast(`+${ADS.freeCoinsPerAd} coins`);
  }
  renderShop();
});

// ---------- settings ----------

function renderSettings() {
  $('#set-music').value = save.music;
  $('#set-sfx').value = save.sfx;
  $('#set-haptics').checked = save.haptics;
  $('#off-val').textContent = `${save.offsetMs} ms`;
  $('#privacy-options').hidden = !privacyOptionsRequired;
  $('#privacy-link').href = PRIVACY_POLICY_URL;
  $('#version').textContent = `Echo Beat ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''}${ADS.testing ? ' · test ads' : ''}`;
}

$('#set-music').addEventListener('input', (e) => {
  save.music = +e.target.value;
  audio.setVolumes({ music: save.music });
  persist();
});
$('#set-sfx').addEventListener('input', (e) => {
  save.sfx = +e.target.value;
  audio.setVolumes({ sfx: save.sfx });
  persist();
});
$('#set-haptics').addEventListener('change', (e) => {
  save.haptics = e.target.checked;
  persist();
  buzz('medium');
});

function setOffset(ms) {
  save.offsetMs = Math.max(-300, Math.min(300, Math.round(ms / 5) * 5));
  audio.setOffsetMs(save.offsetMs);
  persist();
  $('#off-val').textContent = `${save.offsetMs} ms`;
}
$('#off-minus').addEventListener('click', () => setOffset(save.offsetMs - 10));
$('#off-plus').addEventListener('click', () => setOffset(save.offsetMs + 10));
$('#calibrate').addEventListener('click', calibrate);
$('#replay-tutorial').addEventListener('click', () => {
  save.seen = [];
  persist();
  toast('Tutorial cards will show again');
});
$('#restore-btn').addEventListener('click', async () => {
  await restore();
  toast(native ? 'Purchases restored' : 'Nothing to restore in the browser');
});
$('#privacy-options').addEventListener('click', () => showPrivacyOptions());

// Tap along with 16 clicks; the average lateness of the taps becomes the offset.
function calibrate() {
  unlockAudio();
  if (!audio.audioReady()) return toast('Tap once more to turn the sound on');
  stopMenuMusic();
  const spb = 0.6, beats = 16;
  const t0 = audio.clock() + 0.6;
  const taps = [];
  audio.startSong({ t0, spb, from: beats, firstBeat: beats, countIn: beats, clicks: true });
  const panel = openSheet(
    `<p class="eyebrow">Audio delay</p><h2>Tap along</h2><p>Tap the pad on every click you hear. Sixteen clicks.</p>
    <button class="pad" id="pad">Tap</button><p id="cal-out"></p>`,
    { onBack: () => (clearTimeout(timer), audio.stopSong(0.05), closeSheet(), ensureMenuMusic()) },
  );
  const pad = $('#pad', panel);
  pad.addEventListener('pointerdown', () => {
    taps.push(audio.clock());
    pad.classList.add('hit');
    setTimeout(() => pad.classList.remove('hit'), 90);
  });
  const timer = setTimeout(() => {
    audio.stopSong(0.05);
    const errs = taps
      .map((t) => {
        const n = Math.round((t - t0) / spb);
        return n >= 3 && n < beats ? t - (t0 + n * spb) : null;
      })
      .filter((x) => x !== null)
      .sort((a, b) => a - b);
    if (errs.length < 6) {
      $('#cal-out', panel).textContent = 'Not enough taps to measure. Try again.';
    } else {
      const median = errs[Math.floor(errs.length / 2)];
      setOffset(save.offsetMs + median * 1000);
      $('#cal-out', panel).textContent = `Measured. Audio delay is now ${save.offsetMs} ms.`;
    }
    pad.disabled = true;
    menuSong = null;
    ensureMenuMusic();
  }, (beats * spb + 0.45) * 1000);
}

// ---------- shared buttons ----------

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) return show(go.dataset.go);
  if (e.target.closest('[data-back]')) back();
});
$('#pause-btn').addEventListener('click', pauseGame);

// ---------- input: swipe anywhere ----------

const SWIPE_MIN = 22; // px of finger travel before a drag counts as a swipe
let touch = null;

function dirFromAngle(dx, dy) {
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  let best = 0, bestDiff = 999;
  DIRS.forEach((d, i) => {
    const diff = Math.abs(((ang - d.a + 540) % 360) - 180);
    if (diff < bestDiff) (bestDiff = diff), (best = i);
  });
  return best;
}

window.addEventListener('pointerdown', (e) => {
  if (screen !== 'play' || !$('#sheet').hidden || e.target.closest('button')) return;
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false };
});
window.addEventListener('pointermove', (e) => {
  if (!touch || touch.done || e.pointerId !== touch.id) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) < SWIPE_MIN) return;
  touch.done = true;
  play?.swipe(dirFromAngle(dx, dy));
});
const endTouch = (e) => {
  if (touch && e.pointerId === touch.id) touch = null;
};
window.addEventListener('pointerup', endTouch);
window.addEventListener('pointercancel', endTouch);

const KEYMAP = { w: 0, e: 1, d: 2, s: 3, a: 4, q: 5, arrowup: 0, arrowdown: 3 };
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') return back();
  if (screen !== 'play' || !play) return;
  if (k === 'r') return startLevel(levelIdx, { hint: !!play.hint });
  if (k === 'p') return pauseGame();
  if (k in KEYMAP && $('#sheet').hidden) play.swipe(KEYMAP[k]);
});

// ---------- app lifecycle ----------

function goBackground() {
  pauseGame();
  audio.suspend();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) goBackground();
  else audio.resume();
});
if (native) {
  App.addListener('backButton', back);
  App.addListener('pause', goBackground);
  App.addListener('resume', () => audio.resume());
}

// ---------- frame loop ----------

function frame() {
  requestAnimationFrame(frame);
  if (screen === 'play' && play) {
    const now = audio.clock();
    play.update(now);
    const v = play.view(now);
    renderer.drawPlay(play, v, {
      hintAction: play.hintAction(play.nextTick),
      hand: tutorial?.kind === 'swipe' && tutorial.moves === 0 && play.mode === 'play',
      spotlight: tutorial?.kind === 'echo' && tutorial.shown && play.mode === 'paused' ? play.sim.echoes[0] : null,
    });
  } else if (screen === 'title') {
    const { beatF, pulse } = menuBeat();
    renderer.drawTitle(beatF, pulse);
    const [rx, ry] = renderer.off.echo;
    const st = document.documentElement.style;
    st.setProperty('--rx', `${(3 + rx * 1.4).toFixed(1)}px`);
    st.setProperty('--ry', `${(2.5 + ry * 1.4).toFixed(1)}px`);
  } else if (dirty) {
    renderer.beginFrame();
    renderer.endFrame();
    dirty = false;
  }
}

// ---------- boot ----------

function boot() {
  paintIcons();
  document.documentElement.style.setProperty('--stamp-mask', `url(${stampMask()})`);
  if (!save.owned.includes(save.ink)) save.ink = 'standard';
  applyInk(save.ink);
  audio.setVolumes({ music: save.music, sfx: save.sfx });
  audio.setOffsetMs(save.offsetMs);
  layoutBoard();
  show('title', { push: false });
  history = [];
  requestAnimationFrame(frame);
  initAds();
  initIAP((id) => {
    if (id === 'premium_inks') toast('Premium inks unlocked');
    if (id === 'remove_ads') toast('Ads between tracks are gone. Thank you!');
    if (id?.startsWith('coins_')) toast('Coins added. Thank you!');
    updateCoins();
    if (screen === 'shop') renderShop();
  });
  // fonts load async; redraw canvas text once they arrive
  document.fonts?.ready.then(() => (dirty = true));
}

boot();

// Test hook for automated checks (dev builds only).
if (import.meta.env?.DEV) {
  window.__eb = {
    get play() {
      return play;
    },
    get screen() {
      return screen;
    },
    startLevel,
    show,
    LEVELS,
    SOLUTIONS,
    save,
    persist,
    clock: () => audio.clock(),
    swipe: (d) => play?.swipe(d),
  };
}
