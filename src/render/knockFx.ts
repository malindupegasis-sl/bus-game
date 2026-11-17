import { HUD_TOP, ROAD_BOTTOM, ROAD_TOP, VIEW_H, VIEW_W } from '../config';

/**
 * Knock-off effects for the Dham Rajina Xpress boost: the vehicles flying off the road ("wrecks")
 * and their dust and cargo. Purely cosmetic: a knocked-off vehicle has already been removed from
 * the world, so nothing here can touch the bus or block a lane.
 *
 * Everything lives in fixed-size pools that are reused, so a busy boost allocates nothing per
 * frame. Positions are screen pixels (the centre of the vehicle's sprite).
 */

export type WreckKind = 'lorry' | 'tuktuk' | 'bike' | 'suv' | 'rival';

export interface Wreck {
  alive: boolean;
  kind: WreckKind;
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Spin, in rotation frames (spinners) or the tip progress 0–1 (lorry). */
  ang: number;
  spin: number;
  age: number;
  /** -1 = towards the top edge of the road, +1 = towards the bottom. */
  dir: -1 | 1;
  /** Lorry / bike: the y it ends up at (the road edge / the verge). */
  toY: number;
  /** Lorry: whether it has landed on its side yet (dust + cargo are thrown once). */
  landed: boolean;
  /** Something to say (tuk-tuk swear, politician, dog), or ''. */
  text: string;
}

export interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  col: string;
  gravity: number;
  /** Cargo stops falling here (and then just scrolls with the road). */
  floor: number;
}

export const MAX_WRECKS = 16;
export const MAX_PARTICLES = 96;
/** Pre-rendered rotation frames for spinning vehicles. */
export const SPIN_FRAMES = 8;
/** Lorry tip-over frames: leaning steps, then lying on its side. */
export const TIP_FRAMES = 5;
const TIP_TIME = 0.3;
/** Screen shake on each knockout: amplitude (px) and duration (s). */
export const SHAKE_TIME = 0.12;

const DUST = ['#d8c8a0', '#c0a878', '#e8dcc0'];
const CARGO = ['#8a5a2b', '#3a8a3a', '#e0a030', '#b04020'];

/** Small deterministic noise from an id, so effects don't need Math.random's state. */
const noise = (id: number, k: number) => ((Math.imul(id * 31 + k, 2654435761) >>> 0) % 1000) / 1000;

function blankWreck(): Wreck {
  return { alive: false, kind: 'lorry', id: 0, x: 0, y: 0, vx: 0, vy: 0, ang: 0, spin: 0, age: 0, dir: 1, toY: 0, landed: false, text: '' };
}
function blankParticle(): Particle {
  return { alive: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, size: 1, grow: 0, col: '#fff', gravity: 0, floor: VIEW_H };
}

export class KnockFx {
  readonly wrecks: Wreck[] = Array.from({ length: MAX_WRECKS }, blankWreck);
  readonly parts: Particle[] = Array.from({ length: MAX_PARTICLES }, blankParticle);
  shakeT = 0;
  shakeAmp = 0;

  clear(): void {
    for (const w of this.wrecks) w.alive = false;
    for (const p of this.parts) p.alive = false;
    this.shakeT = 0;
  }

  get wreckCount(): number {
    let n = 0;
    for (const w of this.wrecks) if (w.alive) n++;
    return n;
  }

  get particleCount(): number {
    let n = 0;
    for (const p of this.parts) if (p.alive) n++;
    return n;
  }

  shake(amp: number): void {
    this.shakeAmp = this.shakeT > 0 ? Math.max(amp, this.shakeAmp) : amp;
    this.shakeT = SHAKE_TIME;
  }

  /** Reuse a free slot (or the oldest one if all are busy). */
  private slot(): Wreck {
    let oldest = this.wrecks[0];
    for (const w of this.wrecks) {
      if (!w.alive) return w;
      if (w.age > oldest.age) oldest = w;
    }
    return oldest;
  }

  /**
   * Start a knock-off. `x`, `y` are the vehicle's centre on screen, `vx0` its current screen
   * velocity (px/s), `speed` the road's scroll speed (px/s), `i`/`n` its place in a convoy.
   */
  spawn(kind: WreckKind, id: number, x: number, y: number, vx0: number, speed: number, text = '', i = 0, n = 1): Wreck {
    const w = this.slot();
    Object.assign(w, blankWreck());
    w.alive = true;
    w.kind = kind;
    w.id = id;
    w.x = x;
    w.y = y;
    w.text = text;
    // Off the nearer edge of the road (the middle lane goes down, onto the wider verge).
    w.dir = y < (ROAD_BOTTOM + 9) / 2 - 8 ? -1 : 1;
    const r = noise(id, i);
    switch (kind) {
      case 'lorry': // Too heavy to fly: shunted sideways, tips over.
        // The bus shoves it forward and sideways to the road edge, where it ends up on its side.
        w.vx = 40;
        w.toY = w.dir < 0 ? ROAD_TOP + 8 : ROAD_BOTTOM - 8;
        break;
      case 'tuktuk': // Spins like a top and flies off the top of the screen.
        w.vx = -speed * 0.35 + 20;
        w.vy = -110; // then accelerates upwards (see update), so the swear bubble is readable
        w.spin = 16 + r * 6;
        break;
      case 'suv': { // Bowling pins: a fan of directions, ahead and to both sides.
        // Fan of directions, all clearly sideways (none straight ahead), alternating up/down.
        const o = n > 1 ? i / (n - 1) - 0.5 : 0;
        const side = o === 0 ? (r < 0.5 ? -1 : 1) : Math.sign(o);
        const a = side * (0.65 + Math.abs(o) * 1.2 + r * 0.2);
        const sp = 200 + r * 80;
        w.vx = -speed + Math.cos(a) * sp * 0.8;
        w.vy = Math.sin(a) * sp;
        w.spin = (a >= 0 ? 1 : -1) * (12 + r * 8);
        break;
      }
      case 'rival': // Spins round and slides off backwards.
        w.vx = -speed - 50;
        w.vy = w.dir * 45;
        w.spin = -w.dir * 9;
        break;
      case 'bike': // Swerves onto the verge and stops; the family is not amused.
        w.vx = vx0;
        w.toY = w.dir < 0 ? 13 : ROAD_BOTTOM - 6;
        break;
    }
    return w;
  }

  private particle(): Particle | null {
    for (const p of this.parts) if (!p.alive) return p;
    return null;
  }

  private emit(x: number, y: number, vx: number, vy: number, life: number, size: number, grow: number, col: string, gravity: number, floor: number): void {
    const p = this.particle();
    if (!p) return;
    p.alive = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.age = 0;
    p.life = life;
    p.size = size;
    p.grow = grow;
    p.col = col;
    p.gravity = gravity;
    p.floor = floor;
  }

  /** The lorry lands on its side: a dust cloud and its cargo spilling across the verge. */
  private crashLand(w: Wreck): void {
    for (let k = 0; k < 10; k++) {
      const r = noise(w.id, k + 10);
      this.emit(w.x - 20 + r * 40, w.y + 6, (r - 0.5) * 50, -10 - r * 25, 0.55 + r * 0.25, 2, 9, DUST[k % 3], 0, VIEW_H);
    }
    for (let k = 0; k < 9; k++) {
      const r = noise(w.id, k + 30);
      this.emit(w.x - 10 + r * 24, w.y - 4, (r - 0.3) * 120, -90 - r * 70, 1.3, 2, 0, CARGO[k % 4], 420, w.y + 6 + (k % 3) * 2);
    }
  }

  update(dt: number, speed: number): void {
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    if (dt <= 0) return;
    for (const w of this.wrecks) {
      if (!w.alive) continue;
      w.age += dt;
      switch (w.kind) {
        case 'lorry':
          // Slows to a stop on the verge (from its own speed to the road's scroll speed).
          w.vx += (-speed - w.vx) * Math.min(1, dt * 3);
          w.y += (w.toY - w.y) * Math.min(1, dt * 10);
          w.ang = Math.min(1, w.age / TIP_TIME);
          if (!w.landed && w.ang >= 1) {
            w.landed = true;
            this.crashLand(w);
          }
          break;
        case 'bike':
          w.vx += (-speed - w.vx) * Math.min(1, dt * 5);
          w.y += (w.toY - w.y) * Math.min(1, dt * 9);
          break;
        case 'suv':
          w.vx += (-speed - w.vx) * Math.min(1, dt * 0.8);
          w.ang += w.spin * dt;
          break;
        case 'tuktuk':
          w.vy -= 320 * dt;
          w.ang += w.spin * dt;
          break;
        default:
          w.ang += w.spin * dt;
      }
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      if (w.x < -60 || w.x > VIEW_W + 80 || w.y < -50 || w.y > HUD_TOP + 30 || w.age > 4) w.alive = false;
    }
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      p.size += p.grow * dt;
      if (p.gravity) {
        p.vy += p.gravity * dt;
        if (p.y + p.vy * dt >= p.floor) {
          p.y = p.floor;
          p.vy = 0;
          p.gravity = 0;
          p.vx = -speed;
        }
      } else if (p.grow) {
        p.vx += (-speed - p.vx) * Math.min(1, dt * 3);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /** Current shake offset (px), or 0. */
  shakeOffset(rand: () => number): [number, number] {
    if (this.shakeT <= 0) return [0, 0];
    const a = Math.max(1, Math.round(this.shakeAmp * (this.shakeT / SHAKE_TIME)));
    return [Math.round((rand() * 2 - 1) * a), Math.round((rand() * 2 - 1) * a)];
  }
}

/** Which rotation frame to show for a spin angle (in frames). */
export const spinFrame = (ang: number) => ((Math.floor(ang) % SPIN_FRAMES) + SPIN_FRAMES) % SPIN_FRAMES;
/** Which tip-over frame to show for the lorry's tip progress (0–1). */
export const tipFrame = (p: number) => Math.min(TIP_FRAMES - 1, Math.floor(p * (TIP_FRAMES - 1) + 1e-9));
