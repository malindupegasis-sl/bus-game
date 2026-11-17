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

export type Side = 'right' | 'above' | 'below';

/**
 * Place a w×h bubble next to `anchor` (the thing that's talking), trying the sides in `order`.
 * A spot is used only if the bubble and its tail are fully on screen (above the HUD) and clear of
 * `avoid` (the bus). Returns null if no side works.
 */
export function placeBubble(
  anchor: Box,
  w: number,
  h: number,
  avoid: Box | null,
  order: readonly Side[],
): { x: number; y: number; tail: BubbleRect['tail']; tailAt: number } | null {
  const midX = anchor.x + anchor.w / 2;
  const clampX = (x: number) => Math.max(0, Math.min(VIEW_W - w, x));
  for (const side of order) {
    const c =
      side === 'right'
        ? { x: anchor.x + anchor.w + 4, y: anchor.y + anchor.h / 2 - h / 2, tail: 'left' as const, tailAt: anchor.y + anchor.h / 2 }
        : side === 'above'
          ? { x: clampX(midX - w / 2), y: anchor.y - h - 4, tail: 'down' as const, tailAt: midX }
          : { x: clampX(midX - w / 2), y: anchor.y + anchor.h + 4, tail: 'up' as const, tailAt: midX };
    const r = { x: Math.round(c.x), y: Math.round(c.y), tail: c.tail, tailAt: Math.round(c.tailAt) };
    const onScreen = r.x >= 0 && r.x + w <= VIEW_W && r.y >= 0 && r.y + h <= HUD_TOP;
    // The tail reaches 3px outside the box toward the speaker: keep that clear of the bus too.
    const withTail = { x: r.x - 3, y: r.y - 3, w: w + 6, h: h + 6 };
    if (onScreen && (!avoid || !overlaps(withTail, avoid, 1))) return r;
  }
  return null;
}

/** Bubble size for a phrase in the 5×7 font. */
export function bubbleSize(text: string, scale: number, textWidth: (s: string) => number) {
  return { w: textWidth(text) * scale + PAD * 2, h: GLYPH_H * scale + PAD * 2 };
}

/**
 * Tuk-tuk bubble placement at distance d. It rides along with the tuk-tuk through and after the
 * swerve: behind it (to its right) by default, or above / below it if that would touch the bus or
 * go off screen. If no spot is clear of the bus, it isn't shown.
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
  const { w, h } = bubbleSize(text, scale, opts.textWidth);
  const k = KINDS.tuktuk;
  const tx = obstacleX(o, d);
  const tBottom = laneY(obstacleLane(o, d)) + VEHICLE_BASELINE;
  const tTop = tBottom - k.height + 1;
  if (tx + k.width / 2 < 0 || tx + k.width / 2 > VIEW_W) return null; // goes with the tuk-tuk when it leaves
  const at = placeBubble({ x: tx, y: tTop, w: k.width, h: k.height }, w, h, opts.bus, ['right', 'above', 'below']);
  return at ? { ...at, w, h, text, scale } : null;
}
