/**
 * "3,195 tickets issued": the start-screen play counter as a bus ticket that slides out of a
 * conductor's ticket machine. Pure state; the renderer draws it.
 *
 * It never fakes a +1. When the start screen appears the ticket prints showing the total this
 * phone saw last time (or the real total on a first visit), then counts up to the real total while
 * the machine's light blinks. A 30 s refresh with a higher total counts up on the same ticket.
 */

/** Pause before the ticket starts to come out, so the movement is seen. */
export const PRINT_DELAY = 0.25;
/** Time for the ticket to slide all the way out. */
export const PRINT_TIME = 0.55;
/** Counting up takes this long (at most), however big the jump. */
export const COUNT_TIME = 0.9;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export class TicketCounter {
  /** Total this ticket is heading for, or null when hidden. */
  target: number | null = null;
  private from = 0;
  private age = 0;
  /** When the current count-up began (seconds on `age`'s clock), or null. */
  private countAt: number | null = null;
  private countFrom = 0;

  hide(): void {
    this.target = null;
  }

  /**
   * The start screen appeared with total n. `seen` is what this phone showed last time (null on a
   * first visit): the ticket prints with that and then counts up to n.
   */
  show(n: number, seen: number | null): void {
    this.target = n;
    this.from = seen !== null && seen >= 0 && seen < n ? seen : n;
    this.age = 0;
    this.countAt = this.from < n ? PRINT_DELAY + PRINT_TIME : null;
    this.countFrom = this.from;
  }

  /** A refresh brought total n: count up to it on the ticket already out. */
  raise(n: number): void {
    if (this.target === null) return this.show(n, null);
    if (n <= this.target) return;
    this.countFrom = this.value ?? this.target;
    this.target = n;
    this.countAt = Math.max(this.age, PRINT_DELAY + PRINT_TIME);
  }

  update(dt: number): void {
    if (this.target !== null) this.age += Math.max(0, dt);
  }

  /** How much of the ticket is out of the slot (0..1). */
  get out(): number {
    return Math.max(0, Math.min(1, (this.age - PRINT_DELAY) / PRINT_TIME));
  }

  private get countProgress(): number {
    if (this.countAt === null) return 1;
    return Math.max(0, Math.min(1, (this.age - this.countAt) / COUNT_TIME));
  }

  /** The number printed on the ticket right now, or null when hidden. */
  get value(): number | null {
    if (this.target === null) return null;
    const p = this.countProgress;
    if (p >= 1) return this.target;
    return Math.round(this.countFrom + (this.target - this.countFrom) * easeOut(p));
  }

  /** The machine's light blinks while tickets are being issued (sliding out or counting). */
  get busy(): boolean {
    return this.target !== null && (this.out < 1 || this.countProgress < 1);
  }
}

/** Remembering the last total this phone showed (so the ticket counts up from it next time). */
const SEEN_KEY = 'busgame.ticketsSeen';

export function loadSeen(): number | null {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveSeen(n: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(n));
  } catch {
    /* ignore */
  }
}
