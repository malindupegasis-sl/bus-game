import { LANE_CHANGE_TIME, LANE_COUNT } from '../config';

const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;

/** The player's bus: moves between lanes with a short eased slide, never an instant jump. */
export class Bus {
  /** Lane the bus is heading to. */
  target = 1;
  /** Current (fractional) lane position. */
  pos = 1;
  /** Position at the previous fixed update (for render interpolation). */
  prevPos = 1;
  private from = 1;
  private progress = 1;
  private duration = LANE_CHANGE_TIME;
  /** Seconds since the bus last arrived in a lane (for the landing squash). */
  sinceArrival = Infinity;

  get moving(): boolean {
    return this.progress < 1;
  }

  /** 0 → 1 through the current lane change (1 when settled). For animation only. */
  get moveProgress(): number {
    return this.progress;
  }

  /** −1 moving up, +1 moving down, 0 settled. */
  get moveDir(): number {
    return this.moving ? Math.sign(this.target - this.from) : 0;
  }

  /** Move one lane up (-1) or down (+1). Works mid-slide too, so quick double taps feel responsive. */
  move(dir: -1 | 1): boolean {
    return this.setTarget(this.target + dir);
  }

  setTarget(lane: number): boolean {
    const t = Math.max(0, Math.min(LANE_COUNT - 1, lane));
    if (t === this.target) return false;
    this.from = this.pos;
    this.target = t;
    this.progress = 0;
    // Longer slides take a little longer, but never less than ~half a lane's worth.
    this.duration = LANE_CHANGE_TIME * Math.max(0.6, Math.abs(t - this.from));
    return true;
  }

  update(dt: number): void {
    if (this.progress >= 1) {
      this.sinceArrival += dt;
      return;
    }
    this.progress = Math.min(1, this.progress + dt / this.duration);
    this.pos = this.from + (this.target - this.from) * easeOutCubic(this.progress);
    if (this.progress >= 1) this.sinceArrival = 0;
  }
}
