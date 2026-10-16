// The board, drawn like a risograph print: a few spot inks overprinted on
// paper (multiply blend), halftone floors, hatched walls, paper grain on top,
// and plates that slip out of register a little on every beat.
import { DIRS, COUNT_IN } from './sim.js';
import { paperCanvas, grainCanvas, halftone, hatch, rgba } from './inks.js';

const SQ3 = Math.sqrt(3);
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const lerp = (a, b, t) => a + (b - a) * t;
const rad = (deg) => (deg * Math.PI) / 180;

export const DISPLAY_FONT = '"Dela Gothic One", "Arial Black", sans-serif';
export const TEXT_FONT = '"Archivo Variable", Archivo, "Helvetica Neue", Arial, sans-serif';

// Each ink plate sits slightly off register, like a real print.
const INKS = ['you', 'echo', 'note', 'danger', 'mech', 'line'];
const BASE_REG = { you: [0.9, -0.6], echo: [-1.1, 0.7], note: [0.8, 1], danger: [-0.7, -0.9], mech: [1, 0.5], line: [0, 0] };

export class Renderer {
  constructor(canvas, { fixed = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fixed = fixed;
    this.W = 0;
    this.H = 0;
    this.dpr = 1;
    this.size = 30;
    this.ox = 0;
    this.oy = 0;
    this.insets = { top: 150, bottom: 150, side: 16, seq: 34 };
    this.off = Object.fromEntries(INKS.map((n) => [n, BASE_REG[n]]));
    this.misprint = 0;
    this.ink = null;
    this.lv = null;
  }

  setInk(ink) {
    this.ink = ink;
    this.textures();
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.textures();
    if (this.lv) this.fit(this.lv);
  }

  textures() {
    if (!this.ink || !this.W) return;
    const { ctx, ink, W, H, dpr } = this;
    const s = Math.max(1, Math.round(dpr));
    this.paper = this.fixed ? null : paperCanvas(W, H, ink, dpr);
    this.grain = grainCanvas(W, H, ink, dpr);
    this.dots = [0.95, 1.2, 1.5, 1.85].map((r) => halftone(ctx, rgba(ink.line, 0.5), 7, r, s));
    this.denseDots = halftone(ctx, rgba(ink.line, 0.8), 4, 1.25, s);
    this.wallHatch = hatch(ctx, ink.line, 5, 1.5, s);
    this.gateHatch = hatch(ctx, ink.mech, 5, 1.8, s);
    this.echoDots = halftone(ctx, ink.echo, 4, 1.3, s);
    this.noteDots = halftone(ctx, ink.note, 4, 1.5, s);
  }

  // Scale and centre a level in the space between the HUD and the sequencer.
  fit(lv) {
    this.lv = lv;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of lv.cells.values()) {
      const x = 1.5 * c.q, y = SQ3 * (c.r + c.q / 2);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const { top, bottom, side } = this.insets;
    const availW = this.W - side * 2, availH = this.H - top - bottom;
    this.size = Math.max(10, Math.min(availW / (x1 - x0 + 2), availH / (y1 - y0 + SQ3), 56));
    this.ox = this.W / 2 - ((x0 + x1) / 2) * this.size;
    this.oy = top + availH / 2 - ((y0 + y1) / 2) * this.size;
  }

  center(k) {
    const c = this.lv.cells.get(k);
    return [this.ox + this.size * 1.5 * c.q, this.oy + this.size * SQ3 * (c.r + c.q / 2)];
  }

  // Ink plate offsets for this frame: a small wobble on every beat, a big one on a misprint.
  register(beat, pulse) {
    const m = this.misprint;
    INKS.forEach((name, i) => {
      const [bx, by] = BASE_REG[name];
      const a = beat * 2.39 + i * 1.7;
      const w = name === 'line' ? m * 3 : 1.3 * pulse + m * 10;
      this.off[name] = [bx + Math.cos(a) * w, by + Math.sin(a) * w];
    });
  }

  // Draw with one ink, shifted by that ink's registration offset. Paths must be
  // built inside fn, because the offset applies when points are added.
  inked(name, fn) {
    const { ctx } = this;
    const [dx, dy] = this.off[name];
    ctx.save();
    ctx.translate(dx, dy);
    fn(this.ink[name]);
    ctx.restore();
  }

  // Paper-coloured knockouts (eye whites): ink removed rather than added.
  knockout(fn) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.ink.paper;
    ctx.strokeStyle = this.ink.paper;
    fn();
    ctx.restore();
  }

  hex(x, y, r) {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  beginFrame() {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.paper) ctx.drawImage(this.paper, 0, 0, this.W, this.H);
    else {
      ctx.fillStyle = this.ink.paper;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    ctx.globalCompositeOperation = this.ink.blend;
  }

  endFrame() {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.grain) ctx.drawImage(this.grain, 0, 0, this.W, this.H);
  }

  // ---------- tiles ----------

  drawCell(c, x, y, st) {
    const { ctx } = this;
    const s = this.size, R = s * 0.93;
    if (c.t === '#') {
      this.inked('line', (col) => {
        this.hex(x, y, R);
        ctx.fillStyle = this.wallHatch;
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      });
      return;
    }
    if (st.broken) {
      this.inked('line', (col) => {
        this.hex(x, y, R * 0.88);
        ctx.fillStyle = this.denseDots;
        ctx.fill();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = rgba(col, 0.55);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
      });
      return;
    }
    this.inked('line', (col) => {
      this.hex(x, y, R);
      ctx.fillStyle = this.dots[st.dotsIdx || 0];
      ctx.fill();
      ctx.strokeStyle = rgba(col, 0.5);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
    switch (c.t) {
      case 'c':
        this.inked('line', (col) => {
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(1.3, s * 0.05);
          ctx.lineJoin = 'miter';
          ctx.beginPath();
          ctx.moveTo(x - s * 0.62, y - s * 0.12);
          ctx.lineTo(x - s * 0.2, y + s * 0.06);
          ctx.lineTo(x + s * 0.04, y - s * 0.22);
          ctx.lineTo(x + s * 0.3, y + s * 0.1);
          ctx.lineTo(x + s * 0.6, y + s * 0.02);
          ctx.moveTo(x - s * 0.2, y + s * 0.06);
          ctx.lineTo(x - s * 0.12, y + s * 0.44);
          ctx.moveTo(x + s * 0.04, y - s * 0.22);
          ctx.lineTo(x - s * 0.06, y - s * 0.55);
          ctx.stroke();
        });
        break;
      case '^': case 'v': case '1': case '2': case '3': case '4':
        this.spikes(x, y, st.spike, st.pop ?? 1);
        break;
      case 'p':
        this.inked('mech', (col) => {
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(2, s * 0.08);
          ctx.beginPath();
          ctx.arc(x, y, s * 0.48, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = st.pressed ? col : rgba(col, 0.35);
          ctx.beginPath();
          ctx.arc(x, y, s * (st.pressed ? 0.34 : 0.16), 0, TAU);
          ctx.fill();
        });
        break;
      case 'G':
        this.inked('mech', (col) => {
          this.hex(x, y, R * 0.84);
          ctx.strokeStyle = col;
          if (st.gateOpen) {
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.fillStyle = this.gateHatch;
            ctx.fill();
            ctx.lineWidth = Math.max(2, s * 0.09);
            ctx.stroke();
            ctx.beginPath();
            for (const i of [-1, 0, 1]) {
              ctx.moveTo(x + i * s * 0.28, y - s * 0.62);
              ctx.lineTo(x + i * s * 0.28, y + s * 0.62);
            }
            ctx.stroke();
          }
        });
        break;
      case 'E':
        this.exit(x, y, st);
        break;
      case 'o':
        if (!st.collected) this.note(x, y - st.pulse * s * 0.07, s * 0.32);
        break;
      case 'T': case 'U': {
        const name = c.t === 'T' ? 'you' : 'mech';
        this.inked(name, (col) => {
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(1.8, s * 0.07);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((st.beat || 0) * (Math.PI / 6));
          for (const f of [0.48, 0.32, 0.16]) {
            ctx.beginPath();
            if (c.t === 'T') ctx.arc(0, 0, s * f, 0.3, TAU - 0.3);
            else {
              ctx.rect(-s * f * 0.78, -s * f * 0.78, s * f * 1.56, s * f * 1.56);
              ctx.rotate(Math.PI / 4);
            }
            ctx.stroke();
          }
          ctx.restore();
        });
        break;
      }
      case 'a': case 'b': case 'd':
        if (!st.keyTaken) this.key(x, y - (st.pulse || 0) * s * 0.05, c.t);
        break;
      case 'A': case 'B': case 'D':
        this.door(x, y, c.t.toLowerCase(), st.doorOpen);
        break;
      case 'x':
        if (st.erased) {
          this.inked('echo', (col) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-0.5);
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = rgba(col, 0.6);
            ctx.lineWidth = 1.2;
            ctx.strokeRect(-s * 0.34, -s * 0.17, s * 0.68, s * 0.34);
            ctx.restore();
          });
        } else this.eraser(x, y, s);
        break;
    }
  }

  // The shape that pairs a key with its doors: a circle, a triangle or a square.
  keyShape(x, y, r, kind) {
    const { ctx } = this;
    ctx.beginPath();
    if (kind === 'a') ctx.arc(x, y, r, 0, TAU);
    else if (kind === 'b') {
      ctx.moveTo(x, y - r * 1.1);
      ctx.lineTo(x + r * 1.05, y + r * 0.75);
      ctx.lineTo(x - r * 1.05, y + r * 0.75);
      ctx.closePath();
    } else ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  }

  // A key lying on the floor: its bow is the shape of the doors it opens.
  key(x, y, kind) {
    const { ctx } = this;
    const s = this.size;
    const bx = x - s * 0.26, by = y - s * 0.02, br = s * 0.24;
    const shaft = () => {
      ctx.beginPath();
      ctx.moveTo(bx + br * 0.9, by);
      ctx.lineTo(x + s * 0.5, by);
      ctx.moveTo(x + s * 0.32, by);
      ctx.lineTo(x + s * 0.32, by + s * 0.2);
      ctx.moveTo(x + s * 0.46, by);
      ctx.lineTo(x + s * 0.46, by + s * 0.15);
    };
    this.inked('mech', (col) => {
      ctx.fillStyle = col;
      this.keyShape(bx, by, br, kind);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(2.5, s * 0.11);
      ctx.lineCap = 'butt';
      shaft();
      ctx.stroke();
    });
    this.inked('line', (col) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'miter';
      this.keyShape(bx, by, br, kind);
      ctx.stroke();
    });
    this.knockout(() => {
      this.keyShape(bx, by, br * 0.36, kind);
      ctx.fill();
    });
  }

  // A locked door: a solid block with a keyhole in its key's shape. Open, just its frame.
  door(x, y, kind, open) {
    const { ctx } = this;
    const s = this.size, R = s * 0.93;
    if (open) {
      this.inked('mech', (col) => {
        this.hex(x, y, R * 0.84);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        this.keyShape(x, y, s * 0.16, kind);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      return;
    }
    this.inked('mech', (col) => {
      this.hex(x, y, R * 0.86);
      ctx.fillStyle = col;
      ctx.fill();
    });
    this.inked('line', (col) => {
      this.hex(x, y, R * 0.86);
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.stroke();
    });
    this.knockout(() => {
      this.keyShape(x, y - s * 0.04, s * 0.24, kind);
      ctx.fill();
    });
    this.inked('line', (col) => {
      ctx.fillStyle = col;
      ctx.fillRect(x - s * 0.05, y + s * 0.18, s * 0.1, s * 0.24);
    });
  }

  spikes(x, y, state, pop) {
    const { ctx } = this;
    const s = this.size;
    const tri = (h, w) => {
      ctx.beginPath();
      for (const [dx, dy] of [[-0.3, 0.2], [0.3, 0.2], [0, -0.14]]) {
        const sx = x + dx * s, sy = y + dy * s + s * 0.12;
        ctx.moveTo(sx - w * s, sy);
        ctx.lineTo(sx + w * s, sy);
        ctx.lineTo(sx, sy - h * s);
        ctx.closePath();
      }
    };
    if (state === 'up') {
      this.inked('danger', (col) => {
        tri(0.5 * pop, 0.16);
        ctx.fillStyle = col;
        ctx.fill();
      });
      this.inked('line', (col) => {
        tri(0.5 * pop, 0.16);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.3;
        ctx.lineJoin = 'miter';
        ctx.stroke();
      });
    } else if (state === 'rising') {
      // yellow overprinted with red: orange tips, a one-beat warning
      this.inked('note', (col) => {
        tri(0.3, 0.15);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.fillStyle = rgba(this.ink.danger, 0.55);
        ctx.fill();
        ctx.strokeStyle = this.ink.danger;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'miter';
        ctx.stroke();
      });
    } else {
      this.inked('line', (col) => {
        tri(0.09, 0.14);
        ctx.strokeStyle = rgba(col, 0.75);
        ctx.lineWidth = 1.3;
        ctx.stroke();
      });
    }
  }

  exit(x, y, st) {
    const { ctx } = this;
    const R = this.size * 0.93;
    if (st.exitOpen) {
      this.inked('note', (col) => {
        this.hex(x, y, R * (0.76 + 0.06 * (st.pulse || 0)));
        ctx.fillStyle = col;
        ctx.fill();
      });
      this.inked('line', (col) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2;
        for (const f of [0.74, 0.5, 0.26]) {
          this.hex(x, y, R * f);
          ctx.stroke();
        }
      });
    } else {
      this.inked('line', (col) => {
        ctx.strokeStyle = rgba(col, 0.7);
        ctx.lineWidth = 1.8;
        ctx.setLineDash([3, 3]);
        for (const f of [0.74, 0.5]) {
          this.hex(x, y, R * f);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        if (st.notesLeft) {
          ctx.fillStyle = col;
          ctx.font = `800 ${Math.round(this.size * 0.42)}px ${TEXT_FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(st.notesLeft, x, y + 1);
        }
      });
    }
  }

  // A yellow disc with an eighth note printed on it.
  note(x, y, r) {
    const { ctx } = this;
    this.inked('note', (col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    });
    const glyph = this.ink.blend === 'screen' ? (fn) => this.knockout(() => fn(this.ink.paper)) : (fn) => this.inked('line', fn);
    glyph((col) => {
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.3, r * 0.14);
      ctx.lineCap = 'butt';
      const hx = x - r * 0.16, hy = y + r * 0.34;
      const stem = hx + r * 0.22;
      ctx.beginPath();
      ctx.ellipse(hx, hy, r * 0.26, r * 0.19, -0.4, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(stem, hy - r * 0.05);
      ctx.lineTo(stem, hy - r * 0.92);
      ctx.bezierCurveTo(stem + r * 0.08, hy - r * 0.62, stem + r * 0.48, hy - r * 0.6, stem + r * 0.36, hy - r * 0.26);
      ctx.stroke();
    });
  }

  eraser(x, y, s) {
    const { ctx } = this;
    this.inked('echo', (col) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.5);
      ctx.fillStyle = col;
      ctx.fillRect(-s * 0.36, -s * 0.18, s * 0.72, s * 0.36);
      ctx.restore();
    });
    this.inked('line', (col) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.5);
      ctx.fillStyle = this.wallHatch;
      ctx.fillRect(s * 0.06, -s * 0.18, s * 0.3, s * 0.36);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s * 0.36, -s * 0.18, s * 0.72, s * 0.36);
      ctx.beginPath();
      ctx.moveTo(s * 0.06, -s * 0.18);
      ctx.lineTo(s * 0.06, s * 0.18);
      ctx.stroke();
      ctx.restore();
    });
  }

  // ---------- characters ----------

  // You: a round blob with eyes that look where you are heading.
  body(x, y, r, sx, sy) {
    const { ctx } = this;
    this.inked('you', (col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, y, r * sx, r * sy, 0, 0, TAU);
      ctx.fill();
    });
  }

  ghostPath(x, y, r, wave) {
    const { ctx } = this;
    const bottom = y + r * 0.72;
    ctx.beginPath();
    ctx.moveTo(x - r, bottom);
    ctx.lineTo(x - r, y - r * 0.05);
    ctx.arc(x, y - r * 0.05, r, Math.PI, 0);
    ctx.lineTo(x + r, bottom);
    const n = 3, w = (2 * r) / n;
    for (let i = 0; i < n; i++) {
      const x1 = x + r - w * i;
      ctx.quadraticCurveTo(x1 - w / 2, bottom + r * (i % 2 === wave % 2 ? 0.34 : -0.12), x1 - w, bottom);
    }
    ctx.closePath();
  }

  // Your echo: the same shape, printed in pink, with hollow eyes.
  ghost(x, y, r, { forming = false, wave = 0, alpha = 1 } = {}) {
    const { ctx } = this;
    this.inked('echo', (col) => {
      this.ghostPath(x, y, r, wave);
      if (forming) {
        ctx.fillStyle = this.echoDots;
        ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = col;
        ctx.fill();
      }
    });
    this.knockout(() => {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(x + s * r * 0.36, y - r * 0.12, r * 0.18, r * 0.24, 0, 0, TAU);
        ctx.fill();
      }
    });
  }

  eyes(x, y, r, dir, look = 1) {
    const { ctx } = this;
    const a = rad(DIRS[dir ?? 0].a);
    const lx = Math.cos(a) * r * 0.16 * look, ly = Math.sin(a) * r * 0.14 * look;
    const at = [-1, 1].map((s) => [x + s * r * 0.36 + lx * 0.5, y - r * 0.14 + ly * 0.5]);
    this.knockout(() => {
      for (const [ex, ey] of at) {
        ctx.beginPath();
        ctx.ellipse(ex, ey, r * 0.22, r * 0.28, 0, 0, TAU);
        ctx.fill();
      }
    });
    this.inked('line', (col) => {
      ctx.fillStyle = col;
      for (const [ex, ey] of at) {
        ctx.beginPath();
        ctx.arc(ex + lx * 0.55, ey + ly * 0.6, r * 0.12, 0, TAU);
        ctx.fill();
      }
    });
  }

  // Metronome: a black pyramid with a paper-white arm swinging on the beat.
  metronome(x, y, beatF) {
    const { ctx } = this;
    const s = this.size;
    this.inked('line', (col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.42, y + s * 0.4);
      ctx.lineTo(x + s * 0.42, y + s * 0.4);
      ctx.lineTo(x + s * 0.16, y - s * 0.5);
      ctx.lineTo(x - s * 0.16, y - s * 0.5);
      ctx.closePath();
      ctx.fill();
    });
    const ang = 0.5 * Math.cos(Math.PI * beatF);
    this.knockout(() => {
      ctx.save();
      ctx.translate(x, y + s * 0.28);
      ctx.rotate(ang);
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -s * 0.62);
      ctx.stroke();
      ctx.fillRect(-s * 0.09, -s * 0.42, s * 0.18, s * 0.12);
      ctx.restore();
    });
  }

  // Your shadow: your shape printed in the dark line ink, eyes on you.
  // `crouch` (0..1) squashes it on the beat before it steps.
  shadow(x, y, r, look, crouch = 0) {
    const { ctx } = this;
    const sx = 1 + 0.12 * crouch, sy = 1 - 0.16 * crouch;
    const cy = y + r * 0.16 * crouch;
    this.inked('line', (col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, cy, r * sx, r * sy, 0, 0, TAU);
      ctx.fill();
    });
    const lx = Math.cos(look) * r * 0.1, ly = Math.sin(look) * r * 0.1;
    const at = [-1, 1].map((s) => [x + s * r * 0.34 + lx, cy - r * 0.12 + ly]);
    this.knockout(() => {
      for (const [i, [ex, ey]] of at.entries()) {
        // narrowed, slanted eyes
        ctx.beginPath();
        ctx.ellipse(ex, ey, r * 0.23, r * 0.15, (i ? -1 : 1) * 0.35, 0, TAU);
        ctx.fill();
      }
    });
    this.inked('danger', (col) => {
      ctx.fillStyle = col;
      for (const [ex, ey] of at) {
        ctx.beginPath();
        ctx.arc(ex + lx * 0.6, ey + ly * 0.4, r * 0.09, 0, TAU);
        ctx.fill();
      }
    });
  }

  chevron(x, y, a, len, width, color) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(-len * 0.45, -len * 0.7);
    ctx.lineTo(len * 0.3, 0);
    ctx.lineTo(-len * 0.45, len * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- a whole frame of play ----------

  drawPlay(play, v, extras = {}) {
    const { ctx } = this;
    const sim = play.sim;
    const s = this.size;
    const T = Math.max(0, v.T);
    this.misprint = Math.max(0, this.misprint - 1 / 40);
    this.register(Math.floor(v.beatF), v.pulse);
    this.beginFrame();

    // floor and tiles
    const echoNow = sim.echoes.map((e) => sim.echoPos(e, T));
    const wave = ((Math.floor(v.beatF) % 3) + 3) % 3;
    const pop = 0.7 + 0.3 * easeOut(v.sinceTick / 0.08);
    for (const c of sim.lv.cells.values()) {
      const [x, y] = this.center(c.k);
      const group = (((c.q - c.r) % 3) + 3) % 3;
      this.drawCell(c, x, y, {
        dotsIdx: !v.counting && group === wave ? Math.round(v.pulse * 3) : 0,
        spike: sim.spikeState(c.k, T),
        pop,
        pressed: c.t === 'p' && (sim.player === c.k || echoNow.includes(c.k)),
        gateOpen: sim.gatesOpen,
        exitOpen: sim.exitOpen,
        notesLeft: sim.notesLeft,
        collected: sim.collected.has(c.k),
        erased: sim.erased.has(c.k),
        broken: sim.broken.has(c.k),
        keyTaken: sim.opened.has(c.t),
        doorOpen: sim.opened.has(c.t.toLowerCase()),
        pulse: v.pulse,
        beat: T,
      });
    }

    // where every echo and metronome walks
    for (const m of sim.lv.metronomes) {
      this.inked('line', (col) => {
        const a = this.center(m.path[0]), b = this.center(m.path[m.path.length - 1]);
        ctx.strokeStyle = rgba(col, 0.45);
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
    for (const e of sim.echoes) {
      this.inked('echo', (col) => {
        ctx.strokeStyle = rgba(col, 0.6);
        ctx.lineWidth = Math.max(2.5, s * 0.11);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([0.1, s * 0.3]);
        ctx.beginPath();
        e.path.forEach((k, i) => {
          const [px, py] = this.center(k);
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // hint guide: the hex to be on after the next beat
    if (extras.hintAction !== null && extras.hintAction !== undefined && play.mode === 'play') {
      const a = extras.hintAction;
      const target = a >= 0 ? sim.neighbor(sim.player, a) : sim.player;
      if (sim.lv.cells.has(target)) {
        const [tx, ty] = this.center(target);
        this.inked('note', (col) => {
          this.hex(tx, ty, s * 0.7);
          ctx.fillStyle = this.noteDots;
          ctx.fill();
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }
    }

    // echoes
    const p = easeOut(v.sinceTick / 0.1);
    sim.echoes.forEach((e, i) => {
      const from = this.center(sim.echoPos(e, T - 1)), to = this.center(echoNow[i]);
      const x = lerp(from[0], to[0], p), y = lerp(from[1], to[1], p);
      const nk = sim.echoPos(e, T + 1);
      if (nk !== echoNow[i] && play.mode !== 'won') {
        const [nx, ny] = this.center(nk);
        this.inked('echo', (col) => {
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(nx, ny, s * 0.4, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }
      this.ghost(x, y - v.pulse * s * 0.04, s * 0.36, { forming: !sim.echoHarmful(e, T + 1), wave: T + i });
    });

    if (extras.spotlight) {
      const [sx, sy] = this.center(sim.echoPos(extras.spotlight, T));
      const k = (v.now * 1.2) % 1;
      this.inked('echo', (col) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        for (const f of [k, (k + 0.5) % 1]) {
          ctx.globalAlpha = 1 - f;
          ctx.beginPath();
          ctx.arc(sx, sy, s * (0.6 + f * 0.9), 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
    }

    // metronomes
    for (const m of sim.lv.metronomes) {
      const from = this.center(sim.metronomePos(m, T - 1)), to = this.center(sim.metronomePos(m, T));
      this.metronome(lerp(from[0], to[0], p), lerp(from[1], to[1], p), v.beatF);
    }

    // shadows: drawn a beat ahead, from where they stood to where they are going
    const ticked = T > sim.lastClosed;
    const [px, py] = this.center(sim.player);
    sim.shadows.forEach((k, i) => {
      if (!k && !(ticked && sim.shadowPlan[i])) return;
      const from = ticked ? k : sim.shadowPrev[i];
      const to = ticked ? sim.shadowPlan[i] : k;
      if (!from || !to) return;
      const a = this.center(from), b = this.center(to);
      const x = lerp(a[0], b[0], p), y = lerp(a[1], b[1], p);
      // about to step: a dashed ring on the hex it steps to, and a crouch
      const next = ticked ? null : sim.shadowPlan[i];
      let crouch = 0;
      if (next && next !== k && play.mode === 'play') {
        const [nx, ny] = this.center(next);
        this.inked('line', (col) => {
          ctx.strokeStyle = col;
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(nx, ny, s * 0.4, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        });
        crouch = clamp01((v.beatF - Math.floor(v.beatF) - 0.45) * 2.2);
      }
      this.shadow(x, y - v.pulse * s * 0.03, s * 0.42, Math.atan2(py - y, px - x), crouch);
    });

    this.drawPlayer(play, v);
    this.drawFx(play, v);
    this.endFrame();
    this.drawSequencer(play, v, extras);
    if (extras.hand) this.drawHand(v.now);
  }

  drawPlayer(play, v) {
    const { ctx } = this;
    const sim = play.sim;
    const s = this.size;
    if (play.mode === 'dead') {
      // an ink blot where you were
      const [x, y] = this.center(sim.player);
      this.inked('you', (col) => {
        ctx.fillStyle = col;
        for (const b of play.blots) {
          ctx.beginPath();
          ctx.arc(x + b.x * s, y + b.y * s, b.r * s * easeOut((v.now - play.endedAt) / 0.12), 0, TAU);
          ctx.fill();
        }
      });
      return;
    }
    let [x, y] = this.center(sim.player);
    let scale = 1, sx = 1, sy = 1;
    const an = play.playerAnim;
    if (an) {
      const k = v.now - an.t;
      if (an.bump !== undefined) {
        const d = rad(DIRS[an.bump].a);
        const amt = Math.sin(clamp01(k / 0.16) * Math.PI) * s * 0.22;
        const [fx, fy] = this.center(an.from);
        x = fx + Math.cos(d) * amt;
        y = fy + Math.sin(d) * amt;
      } else if (an.step && an.step !== an.to && sim.lv.cells.has(an.step)) {
        // into one portal, out of the other
        if (k < 0.08) {
          const [fx, fy] = this.center(an.from), [px, py] = this.center(an.step);
          x = lerp(fx, px, easeOut(k / 0.08));
          y = lerp(fy, py, easeOut(k / 0.08));
          scale = 1 - 0.6 * clamp01(k / 0.08);
        } else scale = 0.4 + 0.6 * easeOut((k - 0.08) / 0.1);
      } else {
        const q = easeOut(k / 0.09);
        const [fx, fy] = this.center(an.from);
        x = lerp(fx, x, q);
        y = lerp(fy, y, q);
        sx = 1 + 0.16 * (1 - q);
        sy = 1 - 0.12 * (1 - q);
      }
    }
    const r = s * 0.4 * scale;
    sy *= 1 - v.pulse * 0.07;
    sx *= 1 + v.pulse * 0.04;
    this.body(x, y, r, sx, sy);
    this.eyes(x, y, r, play.lastDir, scale);
    if (play.queued !== null && play.mode === 'play') {
      const a = rad(DIRS[play.queued].a);
      // the step you will take on the next beat: a solid arrowhead
      this.inked('you', (col) => {
        ctx.save();
        ctx.translate(x + Math.cos(a) * s * 0.74, y + Math.sin(a) * s * 0.74);
        ctx.rotate(a);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 0.2, 0);
        ctx.lineTo(-s * 0.1, -s * 0.2);
        ctx.lineTo(-s * 0.1, s * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
    }
  }

  drawFx(play, v) {
    const { ctx } = this;
    const s = this.size;
    for (const f of play.fx) {
      const k = clamp01((v.now - f.t) / f.dur);
      if (k <= 0 || !this.lv.cells.has(f.k)) continue;
      const [x, y] = this.center(f.k);
      if (f.type === 'ring') {
        this.inked(f.ink, (col) => {
          ctx.strokeStyle = col;
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = Math.max(2, s * 0.12 * (1 - k));
          ctx.beginPath();
          ctx.arc(x, y, s * lerp(f.r0 || 0.3, f.r1 || 1.4, easeOut(k)), 0, TAU);
          ctx.stroke();
        });
      } else if (f.type === 'scribble') {
        this.inked('echo', (col) => {
          ctx.strokeStyle = col;
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let i = 0; i < 7; i++) {
            const px = x + (i / 6 - 0.5) * s * 0.9 * easeOut(k * 2);
            const py = y + (i % 2 ? -1 : 1) * s * 0.3;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.stroke();
        });
      } else if (f.type === 'splat') {
        // a shadow gone: its ink spatters and fades
        this.inked('line', (col) => {
          ctx.fillStyle = col;
          ctx.globalAlpha = 1 - k;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + 0.3, d = s * (0.15 + easeOut(k) * (0.45 + (i % 3) * 0.12));
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s * (0.1 - k * 0.06) * (1 + (i % 2)), 0, TAU);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.ellipse(x, y + s * 0.1, s * 0.4 * (1 - k * 0.4), s * 0.16 * (1 - k * 0.4), 0, 0, TAU);
          ctx.fill();
        });
      } else if (f.type === 'chips') {
        this.inked('line', (col) => {
          ctx.fillStyle = col;
          ctx.globalAlpha = 1 - k;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + 0.4;
            const px = x + Math.cos(a) * s * (0.3 + k * 0.4), py = y + Math.sin(a) * s * 0.3 + k * k * s * 1.6;
            this.hex(px, py, s * 0.12 * (1 - k * 0.5));
            ctx.fill();
          }
        });
      } else if (f.type === 'confetti') {
        const names = ['you', 'echo', 'note', 'mech'];
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * TAU + i, sp = 1.2 + (i % 5) * 0.35;
          this.inked(names[i % 4], (col) => {
            ctx.fillStyle = col;
            ctx.globalAlpha = 1 - k * k;
            const px = x + Math.cos(a) * s * sp * easeOut(k), py = y + Math.sin(a) * s * sp * easeOut(k) + k * k * s * 1.2;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(a + k * 6);
            ctx.fillRect(-s * 0.09, -s * 0.05, s * 0.18, s * 0.1);
            ctx.restore();
          });
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- the step sequencer at the bottom ----------

  sequencerRect() {
    const n = 8, gap = 6;
    const sq = Math.min(38, (this.W - 48 - gap * (n - 1)) / n);
    const total = n * sq + (n - 1) * gap;
    return { n, gap, sq, x0: (this.W - total) / 2, y0: this.H - this.insets.seq - sq };
  }

  drawSequencer(play, v, extras = {}) {
    const { ctx, ink } = this;
    const { n, gap, sq, x0, y0 } = this.sequencerRect();
    const cur = Math.floor(v.beatF);
    const phase = v.beatF - cur;
    const shadowOn = play.sim.shadows.some(Boolean);
    ctx.globalCompositeOperation = ink.blend;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (sq + gap), y = y0;
      const b = cur - ((((cur - i) % n) + n) % n);
      const isNext = b === cur - n + 1 || (cur < 0 && i === ((cur + 1) % n + n) % n);
      const isCur = b === cur && cur >= 0;
      const playable = b >= play.goBeat;
      if (isCur && !v.counting && play.mode === 'play') {
        this.inked('note', (col) => {
          ctx.fillStyle = col;
          ctx.fillRect(x, y, sq, sq);
        });
      }
      if (isNext && play.mode === 'play') {
        // fills up as the next beat approaches
        const h = sq * clamp01(phase);
        this.inked('note', () => {
          ctx.fillStyle = this.noteDots;
          ctx.fillRect(x, y + sq - h, sq, h);
        });
      }
      this.inked('line', (col) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = i % 4 === 0 ? 3 : 1.6;
        ctx.strokeRect(x, y, sq, sq);
        // a dark corner on the beats your shadow steps
        if (shadowOn && play.sim.shadowBeat(isNext ? cur + 1 : b)) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(x + sq, y);
          ctx.lineTo(x + sq * 0.7, y);
          ctx.lineTo(x + sq, y + sq * 0.3);
          ctx.fill();
        }
      });
      const cx = x + sq / 2, cy = y + sq / 2;
      const glyph = (d, col, w = 3) => {
        if (d < 0) {
          ctx.fillStyle = col;
          ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
          return;
        }
        const a = rad(DIRS[d].a), L = sq * 0.3;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        ctx.moveTo(-L, 0);
        ctx.lineTo(L * 0.7, 0);
        ctx.moveTo(L * 0.05, -L * 0.62);
        ctx.lineTo(L * 0.75, 0);
        ctx.lineTo(L * 0.05, L * 0.62);
        ctx.stroke();
        ctx.restore();
      };
      if (isNext && play.mode === 'play') {
        const want = extras.hintAction;
        if (want !== null && want !== undefined) this.inked('note', (col) => glyph(want, ink.line, 2));
        if (play.queued !== null) this.inked('you', (col) => glyph(play.queued, col));
      } else if (playable && b <= v.T) {
        const h = play.history.get(b);
        if (h) this.inked(h.bump ? 'danger' : 'you', (col) => glyph(h.d, col));
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // count-in numbers
    if (v.counting && play.mode === 'play' && v.beatF >= play.goBeat - COUNT_IN) {
      const left = play.goBeat - cur;
      const label = left <= 1 ? 'GO' : String(left - 1);
      const k = clamp01(phase / 0.25);
      ctx.globalCompositeOperation = ink.blend;
      this.inked('echo', (col) => {
        ctx.fillStyle = col;
        ctx.font = `${Math.round(64 - 10 * k)}px ${DISPLAY_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, this.W / 2 + 3, y0 - 22 + 2);
      });
      this.inked('line', (col) => {
        ctx.fillStyle = col;
        ctx.font = `${Math.round(64 - 10 * k)}px ${DISPLAY_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(label, this.W / 2, y0 - 22);
      });
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Tutorial: a finger swiping up, over and over.
  drawHand(now) {
    const { ctx, ink } = this;
    const cyc = (now % 1.5) / 1.5;
    const x = this.W / 2, y0 = this.H * 0.72, dist = 90;
    const p = clamp01((cyc - 0.15) / 0.45);
    const y = y0 - easeOut(p) * dist;
    const alpha = cyc < 0.08 ? cyc / 0.08 : cyc > 0.8 ? Math.max(0, 1 - (cyc - 0.8) / 0.15) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = ink.blend;
    this.inked('you', (col) => {
      ctx.fillStyle = col;
      for (let i = 1; i <= 5; i++) {
        const ty = y + i * 12 * p;
        if (ty > y0) break;
        ctx.globalAlpha = alpha * (1 - i / 6);
        ctx.beginPath();
        ctx.arc(x, ty, 9 - i, 0, TAU);
        ctx.fill();
      }
    });
    ctx.globalAlpha = alpha;
    this.knockout(() => {
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, TAU);
      ctx.fill();
    });
    this.inked('line', (col) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, TAU);
      ctx.stroke();
    });
    ctx.restore();
  }

  // ---------- title screen ----------

  // A little loop: you walk a ring of hexes on the beat and your echo follows.
  drawTitle(beatF, pulse) {
    const { ctx, W, H } = this;
    this.misprint = Math.max(0, this.misprint - 1 / 40);
    this.register(Math.floor(beatF), pulse);
    this.beginFrame();
    const s = Math.min(W, H) * 0.105;
    const cx = W * 0.66, cy = H * 0.63;
    const at = (q, r) => [cx + s * 1.5 * q, cy + s * SQ3 * (r + q / 2)];
    const ring = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
    const save = this.size;
    this.size = s;
    const b = Math.floor(beatF), k = easeOut((beatF - b) / 0.35);
    const wave = ((b % 3) + 3) % 3;
    for (const [q, r] of [[0, 0], ...ring, [2, -1], [2, 0], [-2, 1], [1, 1], [0, 2], [-1, 2], [1, -2], [0, -2]]) {
      const [x, y] = at(q, r);
      const group = (((q - r) % 3) + 3) % 3;
      this.drawCell({ t: '.' }, x, y, { dotsIdx: group === wave ? Math.round(pulse * 3) : 0 });
    }
    this.note(...at(0, 0).map((v, i) => v - (i ? pulse * s * 0.07 : 0)), s * 0.32);
    const pos = (n) => ring[((n % 6) + 6) % 6];
    const walk = (n) => {
      const a = at(...pos(n - 1)), c = at(...pos(n));
      return [lerp(a[0], c[0], k), lerp(a[1], c[1], k)];
    };
    const [ex, ey] = walk(b - 3);
    this.ghost(ex, ey - pulse * s * 0.04, s * 0.36, { wave: b });
    const [px, py] = walk(b);
    this.body(px, py, s * 0.4, 1 + pulse * 0.04, 1 - pulse * 0.07);
    const nxt = pos(b + 1), cur = pos(b);
    const dirIdx = DIRS.findIndex((d) => d.q === nxt[0] - cur[0] && d.r === nxt[1] - cur[1]);
    this.eyes(px, py, s * 0.4, Math.max(0, dirIdx));
    this.size = save;
    this.endFrame();
  }

  // ---------- small illustrations for the intro cards ----------

  illustrate(kind) {
    const { ctx, W, H } = this;
    this.register(0, 0);
    this.beginFrame();
    const s = Math.min(H * 0.3, W / 11);
    this.size = s;
    const y = H * 0.42;
    const xs = (n) => [...Array(n)].map((_, i) => W / 2 + (i - (n - 1) / 2) * s * 2.3);
    const label = (x, text) => {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = this.ink.line;
      ctx.font = `600 12px ${TEXT_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y + s * 1.55);
      ctx.restore();
    };
    const floor = (x, t = '.', st = {}) => this.drawCell({ t }, x, y, st);
    if (kind === 'spikes') {
      const states = ['down', 'down', 'rising', 'up'];
      const names = ['beat 1', 'beat 2', 'beat 3: tips', 'beat 4: up'];
      xs(4).forEach((x, i) => {
        floor(x, '^', { spike: states[i] });
        label(x, names[i]);
      });
    } else if (kind === 'gate') {
      const [a, b] = xs(2);
      floor(a, 'p', { pressed: true });
      this.ghost(a, y, s * 0.36);
      floor(b, 'G', { gateOpen: true });
      label(a, 'echo on a plate');
      label(b, 'gate opens');
    } else if (kind === 'crumble') {
      const [a, b] = xs(2);
      floor(a, 'c');
      floor(b, 'c', { broken: true });
      label(a, 'cracked');
      label(b, 'after you step off');
    } else if (kind === 'metronome') {
      const list = xs(3);
      list.forEach((x) => floor(x));
      this.metronome(list[0], y, 0.3);
      this.inked('line', (col) => this.chevron(list[1], y, 0, s * 0.3, 3, col));
      this.inked('line', (col) => this.chevron(list[2], y, 0, s * 0.3, 3, col));
      label(list[1], 'one hex per beat, back and forth');
    } else if (kind === 'teleport') {
      const [a, b, c] = xs(3);
      floor(a, 'T');
      floor(c, 'T');
      this.body(a, y, s * 0.3, 1, 1);
      this.inked('you', (col) => this.chevron(b, y, 0, s * 0.34, 3, col));
      label(a, 'step in');
      label(c, 'come out here');
    } else if (kind === 'eraser') {
      const [a, b] = xs(2);
      floor(a, 'x');
      floor(b);
      this.ghost(b, y, s * 0.36, { forming: true });
      label(a, 'eraser');
      label(b, 'oldest echo gone');
    } else if (kind === 'shadow') {
      const list = xs(4);
      list.forEach((x) => floor(x));
      this.shadow(list[0], y, s * 0.38, 0, 0);
      this.inked('line', (col) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(list[1], y, s * 0.4, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      this.body(list[3], y, s * 0.4, 1, 1);
      this.eyes(list[3], y, s * 0.4, 5, 1);
      label(list[0], 'your shadow');
      label(list[1], 'next step');
      label(list[3], 'you');
    } else if (kind === 'keys') {
      const [a, b, c] = xs(3);
      floor(a, 'a');
      floor(b, 'A');
      floor(c, 'A', { doorOpen: true });
      label(a, 'key');
      label(b, 'its door');
      label(c, 'open for good');
    } else if (kind === 'echo') {
      const list = xs(3);
      list.forEach((x) => floor(x));
      this.ghost(list[0], y, s * 0.36);
      this.inked('echo', (col) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.setLineDash([0.1, 9]);
        ctx.beginPath();
        ctx.moveTo(list[0], y);
        ctx.lineTo(list[2], y);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      this.note(list[2], y, s * 0.32);
      label(list[0], 'your echo');
      label(list[2], 'replays your route');
    }
    this.endFrame();
  }
}
