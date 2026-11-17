import { HUD_TOP, VEHICLE_BASELINE, VIEW_W, laneY } from '../config';
import { KINDS, TUK_SWERVE_TIME, obstacleLane, obstacleX, type Obstacle } from './obstacles';

/** What a swerving tuk-tuk shouts. Exactly these three, picked at random. */
export const SWEARS = ['P#$%A!!', 'H#$%OO!!', 'Buruwa!!!'] as const;

/** How long the bubble stays up (seconds, at the speed the tuk-tuk spawned at). */
export const BUBBLE_TIME = 1.0;
/** Padding around the text (logical px, before scaling). */
const PAD = 3;
const GLYPH_H = 7; // 5×7 font

export interface Box { x: number; y: number; w: number; h: number }

export interface BubbleRect extends Box {
  text: string;
  scale: number;
  /** Which side the tail is on (it points at the tuk-tuk) and where. */
  tail: 'left' | 'down' | 'up';
  tailAt: number;
}

/** Pseudo-random pick from the obstacle id, so it doesn't disturb the spawner's RNG. */
export function swearFor(id: number): string {
  return SWEARS[(Math.imul(id, 2654435761) >>> 0) % SWEARS.length];
}

/** Distance window in which the bubble shows: from the start of the swerve, for ~1 second. */
export function bubbleWindow(o: Obstacle): [number, number] | null {
  if (!Number.isFinite(o.dSwerve)) return null;
  const speed = (o.dSwerveEnd - o.dSwerve) / TUK_SWERVE_TIME; // speed at spawn
  return [o.dSwerve, o.dSwerve + BUBBLE_TIME * speed];
}

const overlaps = (a: Box, b: Box, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * Bubble placement at distance d. It rides along with the tuk-tuk through and after the swerve:
 * behind it (to its right) by default, or above / below it if that would touch the bus or go off
 * screen. If no spot is clear of the bus, it isn't shown.
 */
export function bubbleRect(
  o: Obstacle,
  d: number,
  opts: { textWidth: (s: string) => number; bus: Box; scale: number },
): BubbleRect | null {
  const win = bubbleWindow(o);
  if (!win || d < win[0] || d > win[1]) return null;
  const { scale } = opts;
  const text = swearFor(o.id);
  const w = opts.textWidth(text) * scale + PAD * 2;
  const h = GLYPH_H * scale + PAD * 2;
  const k = KINDS.tuktuk;
  const tx = obstacleX(o, d);
  const tBottom = laneY(obstacleLane(o, d)) + VEHICLE_BASELINE;
  const tTop = tBottom - k.height + 1;
  const tMidX = tx + k.width / 2;
  if (tMidX < 0 || tMidX > VIEW_W) return null; // goes with the tuk-tuk when it leaves the screen
  const clampX = (x: number) => Math.max(0, Math.min(VIEW_W - w, x));

  const raw: BubbleRect[] = [
    { x: tx + k.width + 4, y: tTop + k.height / 2 - h / 2, w, h, text, scale, tail: 'left', tailAt: tTop + k.height / 2 },
    { x: clampX(tMidX - w / 2), y: tTop - h - 4, w, h, text, scale, tail: 'down', tailAt: tMidX },
    { x: clampX(tMidX - w / 2), y: tBottom + 5, w, h, text, scale, tail: 'up', tailAt: tMidX },
  ];
  const candidates = raw.map((c) => ({ ...c, x: Math.round(c.x), y: Math.round(c.y), tailAt: Math.round(c.tailAt) }));

  for (const c of candidates) {
    const onScreen = c.x >= 0 && c.x + c.w <= VIEW_W && c.y >= 0 && c.y + c.h <= HUD_TOP;
    // The tail reaches 3px outside the box toward the tuk-tuk: keep that clear of the bus too.
    const withTail = { x: c.x - 3, y: c.y - 3, w: c.w + 6, h: c.h + 6 };
    if (onScreen && !overlaps(withTail, opts.bus, 1)) return c;
  }
  return null;
}
