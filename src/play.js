// One attempt at a level: the beat clock, swipe timing, checkpoints and the
// hint guide. Rules live in sim.js; this file decides *when* things happen.
//
// The beat clock is the audio clock. Beat n "ticks" at t0 + n * spb: everyone
// steps, including you if you swiped. GRACE seconds later the beat "closes" and
// the board is judged. A swipe inside that window still counts for the beat
// that just ticked; any other swipe waits for the next beat (latest one wins).
import { Sim, COUNT_IN, replay } from './sim.js';
import { clock } from './music.js';

export const GRACE = 0.13;
const LEAD = 0.25; // seconds of silence before the first count-in click

export class Play {
  constructor(level, { solution = null, hint = false, tempo = 1, onEvent = () => {} } = {}) {
    this.level = level;
    this.sim = new Sim(level);
    this.tempo = tempo;
    this.spb = 60 / (level.bpm * tempo);
    this.solution = solution;
    this.emit = onEvent;
    this.mode = 'ready';
    this.t0 = 0;
    this.nextTick = 0;
    this.nextClose = 0;
    this.goBeat = COUNT_IN; // first beat you may move on (later after a resume)
    this.queued = null;
    this.history = new Map(); // beat -> { d } (d = -1 for staying put), for the step sequencer
    this.lastTickAt = -1e9;
    this.lastDir = 0;
    this.playerAnim = null;
    this.fx = [];
    this.blots = [];
    this.checkpoint = null;
    this.noteBeat = null;
    this.pausedAt = 0;
    this.endedAt = 0;
    this.hint = hint && solution ? this.buildHint() : null;
  }

  buildHint() {
    // expected position after every beat of the stored route
    const expected = [];
    const { sim } = replay(this.level, []);
    let n = COUNT_IN;
    for (const a of this.solution.route) {
      if (a >= 0) sim.move(n, a);
      sim.close(n);
      expected.push(sim.player);
      n++;
    }
    return { route: this.solution.route, expected, lost: false };
  }

  // Expected action for beat n while following the hint (-1 = stay), or null.
  hintAction(n) {
    if (!this.hint || this.hint.lost) return null;
    const a = this.hint.route[n - COUNT_IN];
    return a === undefined ? null : a;
  }

  get playing() {
    return this.mode === 'play';
  }

  // Lines the timeline up so beat N lands after a four-beat count-in.
  begin(N = COUNT_IN) {
    this.goBeat = N;
    this.t0 = clock() + LEAD + (COUNT_IN - N) * this.spb;
    this.nextTick = Math.max(this.nextTick, N - COUNT_IN);
    this.nextClose = Math.max(this.nextClose, N - COUNT_IN);
    this.queued = null;
    this.mode = 'play';
    this.emit('begin', { t0: this.t0, from: N });
  }

  update(now = clock()) {
    while (this.mode === 'play') {
      const tTick = this.t0 + this.nextTick * this.spb;
      const tClose = this.t0 + this.nextClose * this.spb + GRACE;
      if (Math.min(tTick, tClose) > now) break;
      if (tTick <= tClose) this.tick(this.nextTick++, tTick);
      else this.closeBeat(this.nextClose++);
    }
    this.fx = this.fx.filter((f) => now - f.t < f.dur);
  }

  tick(n, t) {
    if (n < this.goBeat - COUNT_IN) return;
    this.lastTickAt = t;
    if (n >= this.goBeat && this.queued !== null && this.sim.canMove(n)) {
      const d = this.queued;
      this.queued = null;
      this.doMove(n, d, t);
    }
    this.emit('tick', n);
  }

  // A swipe in direction d.
  swipe(d) {
    if (this.mode !== 'play') return;
    const now = clock();
    this.update(now);
    if (this.mode !== 'play') return;
    const last = this.nextTick - 1;
    if (last >= this.goBeat && now - (this.t0 + last * this.spb) <= GRACE && this.sim.canMove(last)) {
      this.doMove(last, d, now);
      return;
    }
    this.queued = d;
    this.lastDir = d;
  }

  doMove(n, d, t) {
    const from = this.sim.player;
    const r = this.sim.move(n, d);
    this.lastDir = d;
    if (r.type === 'bump') {
      this.history.set(n, { d, bump: true });
      this.playerAnim = { from, to: from, bump: d, t };
      this.emit('bump', { d });
      return;
    }
    this.history.set(n, { d });
    this.playerAnim = { from, to: r.to, step: r.step, t, d };
    this.emit('move', { d, to: r.to });
    for (const ev of r.events) {
      if (ev.type === 'note') this.noteBeat = n;
      this.emit(ev.type, { ...ev, at: r.to, t });
    }
  }

  closeBeat(n) {
    if (n < this.goBeat - COUNT_IN) return;
    const wasOpen = this.sim.gatesOpen;
    const res = this.sim.close(n);
    if (n >= this.goBeat && !this.history.has(n)) this.history.set(n, { d: -1 });
    if (res.type === 'dead') return this.die(res);
    for (const ev of res.events || []) this.emit(ev.type, ev);
    if (res.type === 'countin') return;
    if (this.sim.gatesOpen !== wasOpen) this.emit('gate', { open: this.sim.gatesOpen });
    if (this.noteBeat === n) {
      this.noteBeat = null;
      this.checkpoint = { snap: this.sim.snapshot(), used: false, notes: this.sim.collected.size };
    }
    if (this.hint && !this.hint.lost) {
      const want = this.hint.expected[n - COUNT_IN];
      if (want !== undefined && want !== this.sim.player) {
        this.hint.lost = true;
        this.emit('hintLost');
      }
    }
    if (res.type === 'won') return this.win();
    this.emit('closed', { n });
  }

  die(res) {
    this.mode = 'dead';
    this.endedAt = clock();
    this.queued = null;
    this.death = res;
    this.emit('dead', res);
  }

  win() {
    this.mode = 'won';
    this.endedAt = clock();
    this.emit('won', { beats: this.sim.beatsUsed });
  }

  pause() {
    if (this.mode !== 'play') return false;
    // judge the beat in progress now, so nothing is left half-done
    if (this.nextClose < this.nextTick) this.closeBeat(this.nextClose++);
    if (this.mode !== 'play') return false;
    this.mode = 'paused';
    this.pausedAt = clock();
    this.queued = null;
    this.emit('paused');
    return true;
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.begin(this.nextTick);
  }

  // The slow tempo power-up. Only between count-ins: begin() re-times the beats.
  setTempo(f) {
    if (this.mode !== 'paused' && this.mode !== 'ready') return false;
    this.tempo = f;
    this.spb = 60 / (this.level.bpm * f);
    return true;
  }

  get bpm() {
    return Math.round(this.level.bpm * this.tempo);
  }

  get canContinue() {
    return this.mode === 'dead' && !!this.checkpoint && !this.checkpoint.used;
  }

  // Back to the moment you took your last note, then a fresh count-in.
  continueFromCheckpoint() {
    if (!this.canContinue) return false;
    this.checkpoint.used = true;
    this.sim.restore(this.checkpoint.snap);
    const N = this.sim.lastClosed + 1;
    for (const b of [...this.history.keys()]) if (b >= N) this.history.delete(b);
    this.nextTick = this.nextClose = N;
    this.playerAnim = null;
    this.blots = [];
    this.fx = [];
    this.mode = 'paused';
    this.begin(N);
    return true;
  }

  // Display timing for the renderer.
  view(now = clock()) {
    const t = this.mode === 'paused' ? this.pausedAt : now;
    const beatF = (t - this.t0) / this.spb;
    const T = this.nextTick - 1; // last beat that ticked
    const phase = beatF - Math.floor(beatF);
    const pulse = beatF >= this.goBeat - COUNT_IN ? Math.max(0, 1 - phase / 0.55) : 0;
    return { now: t, beatF, T, sinceTick: t - this.lastTickAt, pulse, upcoming: this.nextTick, counting: beatF < this.goBeat };
  }
}
