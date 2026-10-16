// Procedural soundtrack and sound effects, scheduled on the Web Audio clock,
// which is also the game's master clock. Each side of the record has its own
// groove. Every note you collect brings in another instrument, and the whole
// arrangement plays once the exit is open.

let ac = null;
let out, musicIn, musicTone, musicBus, tapeIn, tapeDelay, sfxBus, noise;
let timer = null;
const vol = { music: 0.8, sfx: 0.9 };
let offset = 0; // player calibration, seconds

const song = { on: false, t0: 0, spb: 0.6, step: 0, from: 4, style: 'dub', key: 0, layers: 0, clicks: true, countIn: 4 };

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];

export function initAudio() {
  if (ac) {
    if (ac.state !== 'running') ac.resume().catch(() => {});
    return ac;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC({ latencyHint: 'interactive' });

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3.5;
  out = ac.createGain();
  out.gain.value = 0.85;
  out.connect(comp).connect(ac.destination);

  musicIn = ac.createGain();
  musicTone = ac.createBiquadFilter();
  musicTone.type = 'lowpass';
  musicTone.frequency.value = 18000;
  musicBus = ac.createGain();
  musicBus.gain.value = vol.music;
  musicIn.connect(musicTone).connect(musicBus).connect(out);

  // Tape echo: a filtered feedback delay with a little wow, the sound of the game's echoes.
  tapeIn = ac.createGain();
  tapeDelay = ac.createDelay(2);
  tapeDelay.delayTime.value = 0.36;
  const fb = ac.createGain();
  fb.gain.value = 0.42;
  const dark = ac.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.value = 2300;
  const thin = ac.createBiquadFilter();
  thin.type = 'highpass';
  thin.frequency.value = 260;
  tapeIn.connect(tapeDelay);
  tapeDelay.connect(dark).connect(thin).connect(fb).connect(tapeDelay);
  thin.connect(musicTone);
  const wow = ac.createOscillator();
  const wowDepth = ac.createGain();
  wow.frequency.value = 0.5;
  wowDepth.gain.value = 0.0016;
  wow.connect(wowDepth).connect(tapeDelay.delayTime);
  wow.start();

  sfxBus = ac.createGain();
  sfxBus.gain.value = vol.sfx;
  sfxBus.connect(out);

  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

export const audioReady = () => !!ac && ac.state === 'running';

// The moment the player is hearing right now, on the clock beats are scheduled on.
export function clock() {
  if (!ac) return performance.now() / 1000;
  return ac.currentTime - (ac.outputLatency || 0) - (ac.baseLatency || 0) - offset;
}

// Converts a time on clock() into AudioContext time, for scheduling.
const toAudio = (t) => t + (ac.outputLatency || 0) + (ac.baseLatency || 0) + offset;

export function setOffsetMs(ms) {
  offset = (ms || 0) / 1000;
}

export function setVolumes({ music, sfx }) {
  if (music !== undefined) vol.music = music;
  if (sfx !== undefined) vol.sfx = sfx;
  if (!ac) return;
  if (song.on) musicBus.gain.setTargetAtTime(vol.music, ac.currentTime, 0.03);
  sfxBus.gain.setTargetAtTime(vol.sfx, ac.currentTime, 0.03);
}

export function suspend() {
  if (ac && ac.state === 'running') ac.suspend().catch(() => {});
}

export function resume() {
  if (ac && ac.state !== 'running') ac.resume().catch(() => {});
}

// ---------- voices ----------

function env(g, t, peak, attack, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(dest, { type = 'sine', f, t, dur, peak, attack = 0.004, cutoff, sweepTo, q = 0.7, send = 0, glide, detune = 0 }) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide[0], t + glide[1]);
  if (detune) o.detune.value = detune;
  const g = ac.createGain();
  let node = o;
  if (cutoff) {
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass';
    fl.Q.value = q;
    fl.frequency.setValueAtTime(cutoff, t);
    if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    node = node.connect(fl);
  }
  node.connect(g).connect(dest);
  if (send) {
    const s = ac.createGain();
    s.gain.value = send;
    g.connect(s).connect(tapeIn);
  }
  env(g, t, peak, attack, dur);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hiss(dest, { t, dur, peak, type = 'highpass', f = 6000, q = 0.8, sweepTo, send = 0, attack = 0.002 }) {
  const s = ac.createBufferSource();
  s.buffer = noise;
  const fl = ac.createBiquadFilter();
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ac.createGain();
  s.connect(fl).connect(g).connect(dest);
  if (send) {
    const sg = ac.createGain();
    sg.gain.value = send;
    g.connect(sg).connect(tapeIn);
  }
  env(g, t, peak, attack, dur);
  s.start(t, Math.random() * 0.6);
  s.stop(t + dur + 0.05);
}

const kick = (t, p = 1) => tone(musicIn, { f: 155, glide: [44, 0.11], t, dur: 0.3, peak: 0.95 * p });
const hat = (t, p = 1, open = false) => hiss(musicIn, { t, dur: open ? 0.16 : 0.035, peak: 0.1 * p, f: 7800 });
const snare = (t, p = 1, send = 0) => {
  hiss(musicIn, { t, dur: 0.16, peak: 0.34 * p, type: 'bandpass', f: 1900, q: 0.7, send });
  tone(musicIn, { type: 'triangle', f: 196, glide: [150, 0.05], t, dur: 0.08, peak: 0.28 * p });
};
const rim = (t, send) => {
  hiss(musicIn, { t, dur: 0.045, peak: 0.3, type: 'bandpass', f: 3300, q: 5, send });
  tone(musicIn, { type: 'square', f: 820, t, dur: 0.03, peak: 0.08, send });
};
const clank = (t, f) => {
  tone(musicIn, { type: 'square', f, t, dur: 0.09, peak: 0.07, cutoff: 3400, q: 6 });
  tone(musicIn, { type: 'square', f: f * 1.483, t, dur: 0.07, peak: 0.05, cutoff: 4200, q: 6 });
};
const stick = (t, accent) => {
  hiss(sfxBus, { t, dur: 0.03, peak: accent ? 0.42 : 0.3, type: 'bandpass', f: 3000, q: 3 });
  tone(sfxBus, { type: 'triangle', f: accent ? 1568 : 1175, t, dur: 0.07, peak: accent ? 0.32 : 0.24 });
};
const chord = (root, minor) => [root, root + (minor ? 3 : 4), root + 7];

// ---------- grooves ----------
// Each style plays one 16th step. `L` is how many layers are in (0..4).

const STYLES = {
  // Side A: dub steppers. Kick on every beat, offbeat skank, a melodica hook through the tape echo.
  dub: {
    prog: [[0, 1], [-2, 0], [-4, 0], [-2, 0]],
    hooks: [
      [0, null, null, 2, null, 3, null, null, 4, null, 3, null, 2, null, null, null],
      [4, null, 3, null, 2, null, null, 0, null, null, 2, null, 3, null, 1, null],
    ],
    play(s, bar, t, L, key, spb, alt) {
      const [deg, minor] = this.prog[bar % 4];
      const r = 45 + key + deg;
      if (s % 4 === 0) kick(t, s % 8 === 0 ? 1 : 0.8);
      if (s % 4 === 2) hat(t, 1, s === 14);
      if (L >= 1 && [0, 3, 6, 8, 11, 14].includes(s)) {
        const n = { 0: 0, 3: 0, 6: 7, 8: 0, 11: 10, 14: 7 }[s];
        tone(musicIn, { type: 'triangle', f: midi(r + n - 12), t, dur: spb * 0.7, peak: 0.42, cutoff: 520 });
      }
      if (L >= 2 && s % 4 === 2) for (const n of chord(r + 12, minor)) tone(musicIn, { type: 'triangle', f: midi(n), t, dur: 0.1, peak: 0.07, cutoff: 2200, send: 0.3 });
      if (L >= 3 && (s === 4 || s === 12)) rim(t, 0.55);
      if (L >= 3 && s % 2 === 1) hiss(musicIn, { t, dur: 0.03, peak: 0.035, type: 'bandpass', f: 6500, q: 1.5 });
      const h = this.hooks[alt % 2][s];
      if (L >= 4 && h !== null) {
        const f = midi(57 + key + PENTA[h + (bar % 2)]);
        tone(musicIn, { type: 'square', f, t, dur: spb * 0.42, peak: 0.045, cutoff: 2400, send: 0.38 });
        tone(musicIn, { type: 'triangle', f, t, dur: spb * 0.45, peak: 0.06, send: 0.2 });
      }
    },
  },
  // Side B: machine room. Four on the floor, a 16th bass ostinato, metal hits.
  machine: {
    prog: [[0, 1], [0, 1], [-4, 0], [-5, 0]],
    bass: [0, null, 0, 12, null, 0, null, 7, 0, null, 0, 12, null, 10, null, 7],
    play(s, bar, t, L, key, spb, alt) {
      const [deg, minor] = this.prog[bar % 4];
      const r = 45 + key + deg;
      if (s % 4 === 0) kick(t);
      hat(t, s % 4 === 2 ? 1 : 0.4);
      const b = this.bass[s];
      if (L >= 1 && b !== null) tone(musicIn, { type: 'square', f: midi(r + b - 12), t, dur: spb * 0.22, peak: 0.16, cutoff: 1300, sweepTo: 220, q: 4 });
      if (L >= 2 && (s === 4 || s === 12)) snare(t, 0.9);
      if (L >= 2 && [3, 7, 11, 14].includes(s)) clank(t, alt % 2 ? 1180 : 990);
      if (L >= 3 && [0, 6, 12].includes(s)) for (const n of chord(r + 12, minor)) tone(musicIn, { type: 'sawtooth', f: midi(n), t, dur: 0.14, peak: 0.045, cutoff: 1900, send: 0.25 });
      if (L >= 4) {
        const c = chord(r + 24, minor);
        const n = c[s % 3] + (Math.floor(s / 3) % 2) * 12;
        tone(musicIn, { type: 'square', f: midi(n), t, dur: 0.07, peak: 0.03, cutoff: 3200, send: 0.18 });
      }
    },
  },
  // Side C: noise. Broken kick pattern that still lands every beat, dirty saw bass, a square lead.
  noise: {
    prog: [[0, 1], [3, 0], [-2, 0], [-4, 0]],
    hooks: [
      [5, null, 4, null, 3, null, 4, null, 2, null, null, 3, null, 1, null, null],
      [2, null, 3, 4, null, 3, null, 2, 1, null, 0, null, 2, null, null, null],
    ],
    play(s, bar, t, L, key, spb, alt) {
      const [deg, minor] = this.prog[bar % 4];
      const r = 45 + key + deg;
      if (s % 4 === 0 || s === 10) kick(t, s === 10 ? 0.6 : 1);
      if (s % 2 === 0) hiss(musicIn, { t, dur: 0.04, peak: s % 4 === 2 ? 0.11 : 0.05, f: 5200 });
      if (L >= 1 && [0, 7, 8, 14].includes(s)) {
        const n = { 0: 0, 7: 0, 8: 0, 14: minor ? 3 : 4 }[s];
        for (const det of [-9, 9]) tone(musicIn, { type: 'sawtooth', f: midi(r + n - 12), t, dur: spb * 0.6, peak: 0.1, cutoff: 750, sweepTo: 260, detune: det });
      }
      if (L >= 2 && (s === 4 || s === 12)) snare(t, 1, 0.12);
      if (L >= 2 && s === 15) snare(t, 0.3);
      const h = this.hooks[alt % 2][s];
      if (L >= 3 && h !== null) tone(musicIn, { type: 'square', f: midi(69 + key + PENTA[h]), t, dur: spb * 0.3, peak: 0.04, cutoff: 3000, send: 0.32 });
      if (L >= 4 && s % 2 === 1) tone(musicIn, { type: 'square', f: midi(81 + key + PENTA[(s * 7 + bar * 3) % 6]), t, dur: 0.05, peak: 0.022, send: 0.15 });
    },
  },
  // Side D: shadows. Half-time feel over a steady pulse: sub bass, a low tom on the
  // off-beats, a two-note minor motif creeping through the tape echo.
  shadow: {
    prog: [[0, 1], [-4, 0], [1, 0], [-2, 1]],
    motif: [[7, 8], [3, 2]],
    play(s, bar, t, L, key, spb, alt) {
      const [deg, minor] = this.prog[bar % 4];
      const r = 45 + key + deg;
      if (s === 0 || s === 10) kick(t, s ? 0.7 : 1);
      if (s === 4 || s === 12) tone(musicIn, { type: 'sine', f: 110 + (s === 12 ? -14 : 0), glide: [70, 0.12], t, dur: 0.18, peak: 0.42 });
      if (s % 4 === 2) hiss(musicIn, { t, dur: 0.03, peak: 0.07, f: 8400 });
      if (L >= 1 && (s === 0 || s === 8)) tone(musicIn, { type: 'sine', f: midi(r - 12), t, dur: spb * 1.9, peak: 0.5, attack: 0.02 });
      if (L >= 2 && s === 8) snare(t, 0.85, 0.3);
      if (L >= 2 && s % 2 === 1) hiss(musicIn, { t, dur: 0.02, peak: 0.03, f: 9500 });
      const m = this.motif[alt % 2];
      if (L >= 3 && (s === 6 || s === 14)) tone(musicIn, { type: 'triangle', f: midi(57 + key + m[s === 6 ? 0 : 1]), t, dur: spb * 0.8, peak: 0.07, send: 0.5 });
      if (L >= 4 && s % 4 === 0) for (const n of chord(r + 12, minor)) tone(musicIn, { type: 'sawtooth', f: midi(n), t, dur: spb * 0.9, peak: 0.022, cutoff: 900, attack: 0.05, send: 0.2 });
    },
  },
  // Side E: locks. Clockwork: woodblock ticks, a plucked arpeggio, tumblers clicking on the offbeats.
  locks: {
    prog: [[0, 0], [5, 0], [-3, 1], [-5, 0]],
    play(s, bar, t, L, key, spb, alt) {
      const [deg, minor] = this.prog[bar % 4];
      const r = 45 + key + deg;
      if (s % 4 === 0) kick(t, s % 8 === 0 ? 1 : 0.75);
      if (s % 4 === 2) tone(musicIn, { type: 'triangle', f: 1760, t, dur: 0.03, peak: 0.14 });
      if (L >= 1 && s % 4 === 0) tone(musicIn, { type: 'square', f: midi(r - 12 + (s === 8 ? 7 : 0)), t, dur: spb * 0.45, peak: 0.12, cutoff: 700, sweepTo: 250, q: 3 });
      if (L >= 2 && [3, 7, 11, 15].includes(s)) {
        tone(musicIn, { type: 'square', f: alt % 2 ? 2350 : 2093, t, dur: 0.018, peak: 0.05, cutoff: 6000 });
        tone(musicIn, { type: 'square', f: alt % 2 ? 3136 : 2794, t: t + 0.02, dur: 0.015, peak: 0.035, cutoff: 7000 });
      }
      if (L >= 2 && (s === 4 || s === 12)) rim(t, 0.25);
      const c = chord(r + 12, minor);
      if (L >= 3 && s % 2 === 0) tone(musicIn, { type: 'triangle', f: midi(c[(s / 2) % 3] + (s >= 8 ? 12 : 0)), t, dur: 0.12, peak: 0.06, send: 0.22 });
      if (L >= 4 && (s === 0 || s === 6 || s === 10)) tone(musicIn, { type: 'square', f: midi(69 + key + PENTA[(s + bar * 2 + alt) % 6]), t, dur: spb * 0.35, peak: 0.035, cutoff: 3200, send: 0.3 });
    },
  },
};

// ---------- the song ----------

function playStep(step, t) {
  const beat = Math.floor(step / 4);
  const s = step % 4;
  if (beat < song.from) {
    // count-in: drum sticks on the beat
    if (s === 0 && song.clicks && beat >= song.from - song.countIn) stick(t, beat === song.from - song.countIn);
    return;
  }
  const rel = step - song.firstStep;
  const bar = Math.floor(rel / 16);
  STYLES[song.style].play(rel % 16, bar, t, song.layers, song.key, song.spb, song.alt + Math.floor(bar / 4));
}

function pump() {
  if (!song.on) return;
  const horizon = ac.currentTime + 0.14;
  for (;;) {
    const t = toAudio(song.t0 + (song.step * song.spb) / 4);
    if (t > horizon) break;
    if (t > ac.currentTime - 0.02) playStep(song.step, Math.max(t, ac.currentTime));
    song.step++;
  }
}

// Starts the groove so beat `from` lands at t0 + from * spb (on clock()). The
// four beats before `from` are a count-in of drum sticks. `firstBeat` is the
// beat the song's first bar starts on, so resuming keeps the bars aligned.
export function startSong({ t0, spb, from, firstBeat = from, style = 'dub', key = 0, layers = 0, alt = 0, countIn = 4, clicks = true }) {
  if (!ac) return;
  stopTimer();
  Object.assign(song, { on: true, t0, spb, from, style, key, layers, alt, countIn, clicks, firstStep: firstBeat * 4, step: Math.max(0, (from - countIn) * 4) });
  const now = ac.currentTime;
  musicTone.frequency.cancelScheduledValues(now);
  musicTone.frequency.setValueAtTime(18000, now);
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setValueAtTime(vol.music, now);
  tapeDelay.delayTime.setTargetAtTime(Math.min(1.2, spb * 0.75), now, 0.05);
  pump();
  timer = setInterval(pump, 25);
}

export function setLayers(n) {
  song.layers = n;
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function stopSong(fade = 0.12) {
  song.on = false;
  stopTimer();
  if (!ac) return;
  const now = ac.currentTime;
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setValueAtTime(musicBus.gain.value, now);
  musicBus.gain.linearRampToValueAtTime(0, now + fade);
}

// The record grinds to a halt: filter closes, volume drops, needle scratch.
export function crash() {
  song.on = false;
  stopTimer();
  if (!ac) return;
  const now = ac.currentTime;
  musicTone.frequency.cancelScheduledValues(now);
  musicTone.frequency.setValueAtTime(6000, now);
  musicTone.frequency.exponentialRampToValueAtTime(180, now + 0.5);
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setValueAtTime(musicBus.gain.value, now);
  musicBus.gain.linearRampToValueAtTime(0, now + 0.7);
  sfx('dead');
}

// ---------- effects ----------

export function sfx(name, arg = 0) {
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime + 0.005;
  const root = 57 + song.key;
  switch (name) {
    case 'tap':
      hiss(sfxBus, { t, dur: 0.03, peak: 0.22, type: 'bandpass', f: 2600, q: 2.5 });
      break;
    case 'step':
      hiss(sfxBus, { t, dur: 0.035, peak: 0.08, type: 'bandpass', f: 1400, q: 1.2 });
      break;
    case 'bump':
      tone(sfxBus, { type: 'triangle', f: 150, glide: [90, 0.08], t, dur: 0.1, peak: 0.32 });
      break;
    case 'note':
      [0, 7, 12, 19].forEach((n, i) => tone(sfxBus, { type: 'triangle', f: midi(root + 12 + n), t: t + i * 0.04, dur: 0.26, peak: 0.16, send: 0.55 }));
      break;
    case 'gate':
      tone(sfxBus, { type: 'square', f: 92, t, dur: 0.12, peak: 0.16, cutoff: 600 });
      hiss(sfxBus, { t, dur: 0.06, peak: 0.12, type: 'bandpass', f: 900, q: 2 });
      break;
    case 'teleport':
      tone(sfxBus, { type: 'sine', f: 320, glide: [1500, 0.14], t, dur: 0.18, peak: 0.2, send: 0.3 });
      break;
    case 'erase':
      hiss(sfxBus, { t, dur: 0.32, peak: 0.22, type: 'bandpass', f: 3200, sweepTo: 500, q: 1.4 });
      break;
    case 'crumble':
      hiss(sfxBus, { t, dur: 0.4, peak: 0.26, type: 'lowpass', f: 1200, sweepTo: 200 });
      for (let i = 0; i < 4; i++) hiss(sfxBus, { t: t + 0.04 + i * 0.05, dur: 0.02, peak: 0.12, type: 'bandpass', f: 2000 + i * 400, q: 3 });
      break;
    case 'dead':
      tone(sfxBus, { type: 'sawtooth', f: 520, glide: [55, 0.32], t, dur: 0.4, peak: 0.22, cutoff: 1800 });
      hiss(sfxBus, { t, dur: 0.3, peak: 0.32, type: 'bandpass', f: 2600, sweepTo: 300, q: 1.2 });
      hiss(sfxBus, { t: t + 0.12, dur: 0.18, peak: 0.2, type: 'bandpass', f: 600, sweepTo: 2400, q: 1.2 });
      break;
    case 'win':
      [0, 4, 7, 12, 16, 19].forEach((n, i) => tone(sfxBus, { type: 'triangle', f: midi(root + n + 12), t: t + i * 0.06, dur: 0.4, peak: 0.14, send: 0.35 }));
      hiss(sfxBus, { t: t + 0.3, dur: 0.6, peak: 0.08, f: 9000 });
      break;
    case 'key':
      tone(sfxBus, { type: 'square', f: 1568, t, dur: 0.04, peak: 0.08, cutoff: 5000 });
      tone(sfxBus, { type: 'square', f: 2093, t: t + 0.05, dur: 0.05, peak: 0.08, cutoff: 5000 });
      tone(sfxBus, { type: 'square', f: 98, t: t + 0.1, dur: 0.12, peak: 0.16, cutoff: 700 });
      hiss(sfxBus, { t: t + 0.1, dur: 0.05, peak: 0.12, type: 'bandpass', f: 1200, q: 2 });
      break;
    case 'poof':
      hiss(sfxBus, { t, dur: 0.35, peak: 0.24, type: 'lowpass', f: 2400, sweepTo: 180 });
      tone(sfxBus, { type: 'sine', f: 220, glide: [55, 0.3], t, dur: 0.35, peak: 0.3 });
      break;
    case 'star':
      tone(sfxBus, { type: 'triangle', f: midi(root + 24 + [0, 4, 7][arg % 3]), t, dur: 0.3, peak: 0.18, send: 0.3 });
      break;
    case 'stamp':
      tone(sfxBus, { f: 120, glide: [50, 0.08], t, dur: 0.18, peak: 0.6 });
      hiss(sfxBus, { t, dur: 0.08, peak: 0.25, type: 'lowpass', f: 1600 });
      break;
    case 'coin':
      tone(sfxBus, { type: 'square', f: 1318.5, t, dur: 0.07, peak: 0.06, cutoff: 5000 });
      tone(sfxBus, { type: 'square', f: 1760, t: t + 0.07, dur: 0.16, peak: 0.06, cutoff: 5000 });
      break;
  }
}
