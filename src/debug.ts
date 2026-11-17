/** Tapping the score this many times within TAP_WINDOW toggles the debug overlay. */
export const TAPS_TO_TOGGLE = 5;
export const TAP_WINDOW = 2500; // ms

const KEY = 'busgame.debug';

/** Pure 5-tap detector: returns the taps to keep, and whether this tap completes a toggle. */
export function registerTap(taps: number[], now: number): { taps: number[]; toggle: boolean } {
  const recent = [...taps.filter((t) => now - t <= TAP_WINDOW), now];
  if (recent.length >= TAPS_TO_TOGGLE) return { taps: [], toggle: true };
  return { taps: recent, toggle: false };
}

export interface DebugSource {
  fpsInfo(): string;
  musicInfo(): string[];
}

/**
 * Small on-screen overlay (HTML, so it costs the game canvas nothing) showing FPS and the music
 * status. Toggle by tapping the score 5 times; the choice is remembered on this device.
 */
export class DebugOverlay {
  private el: HTMLElement;
  private taps: number[] = [];
  private enabled = false;
  // FPS: frame timestamps in the last second, and the worst frame gap seen in it.
  private frames: number[] = [];
  private worst = 0;
  private last = 0;
  private lastPaint = 0;

  constructor(private src: () => string[]) {
    this.el = document.createElement('pre');
    this.el.id = 'debug';
    this.el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.el);
    try {
      this.enabled = localStorage.getItem(KEY) === '1';
    } catch {
      /* ignore */
    }
    this.el.hidden = !this.enabled;
  }

  get on(): boolean {
    return this.enabled;
  }

  tap(now: number): void {
    const r = registerTap(this.taps, now);
    this.taps = r.taps;
    if (!r.toggle) return;
    this.enabled = !this.enabled;
    this.el.hidden = !this.enabled;
    try {
      localStorage.setItem(KEY, this.enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  get fps(): number {
    return this.frames.length;
  }

  get worstFrameMs(): number {
    return this.worst;
  }

  frame(now: number): void {
    if (this.last) this.worst = Math.max(this.worst, now - this.last);
    this.last = now;
    this.frames.push(now);
    while (this.frames.length && now - this.frames[0] > 1000) this.frames.shift();
    if (!this.enabled || now - this.lastPaint < 250) return;
    this.lastPaint = now;
    this.el.textContent = [`FPS ${this.fps}  worst ${this.worst.toFixed(0)}ms`, ...this.src()].join('\n');
    this.worst = 0;
  }
}
