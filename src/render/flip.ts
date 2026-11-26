/**
 * Split-flap ("flip board") counter for "Played N times" on the start screen. Pure state; the
 * renderer draws it. Each change moves the number one step; every digit that differs between two
 * steps flips down (top flap falls, then the new bottom flap swings in).
 */

/** One tile's flip, in seconds. */
export const FLIP_TIME = 0.16;
/** Time between successive numbers when flipping through several. */
export const STEP_TIME = 0.2;
/** A big jump is shown in at most this many steps (still landing on the exact total). */
export const MAX_STEPS = 12;
/** Pause before the first flip when the start screen appears, so the movement is seen. */
export const APPEAR_DELAY = 0.45;

export interface Tile {
  /** Characters before and after this step (' ' = blank tile). */
  from: string;
  to: string;
  /** Flip progress 0..1 (1 = settled). */
  p: number;
}

export class FlipCounter {
  /** The number on the tiles (the step being flipped to), or null when hidden. */
  shown: number | null = null;
  private prev: number | null = null;
  private queue: number[] = [];
  private age = FLIP_TIME;
  private wait = 0;

  hide(): void {
    this.shown = null;
    this.prev = null;
    this.queue = [];
  }

  /** The start screen appeared with total n: show n-1, then flip to n. */
  appear(n: number): void {
    this.shown = Math.max(0, n - 1);
    this.prev = this.shown;
    this.queue = n > this.shown ? [n] : [];
    this.age = FLIP_TIME;
    this.wait = APPEAR_DELAY;
  }

  /** A refresh brought total n: flip through to it if it's higher than where we're heading. */
  raise(n: number): void {
    if (this.shown === null) return this.appear(n);
    const from = this.final ?? 0;
    if (n <= from) return;
    const diff = n - from;
    const steps = Math.min(diff, MAX_STEPS);
    for (let k = 1; k <= steps; k++) this.queue.push(from + Math.round((diff * k) / steps));
  }

  /** Where the counter will end up. */
  get final(): number | null {
    return this.queue.length ? this.queue[this.queue.length - 1] : this.shown;
  }

  get busy(): boolean {
    return this.queue.length > 0 || this.age < FLIP_TIME;
  }

  update(dt: number): void {
    if (this.shown === null) return;
    this.age += dt;
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    if (this.queue.length && this.age >= STEP_TIME) {
      this.prev = this.shown;
      this.shown = this.queue.shift()!;
      this.age = 0;
    }
  }

  /** Tiles to draw, left to right; the width stays fixed at the final number's digit count. */
  tiles(): Tile[] {
    if (this.shown === null) return [];
    const width = String(Math.max(this.shown, this.final ?? 0, this.prev ?? 0)).length;
    const to = String(this.shown).padStart(width, ' ');
    const from = String(this.prev ?? this.shown).padStart(width, ' ');
    const p = Math.min(1, this.age / FLIP_TIME);
    return [...to].map((c, i) => ({ from: from[i], to: c, p: from[i] === c ? 1 : p }));
  }
}
