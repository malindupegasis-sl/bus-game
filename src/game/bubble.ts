import { BUS_X, LANE_HEIGHT, VIEW_W, laneY } from '../config';
import { BUS_SPRITE_W, KINDS, TUK_SWERVE_TIME, obstacleX, type Obstacle } from './obstacles';

/** Censored swearing a swerving tuk-tuk shouts. */
export const SWEARS = ['H*$@O!!', 'P@#$%A!!!', '#@$%&!!', '$#!%@!', '@#$%!!', '%&#@!?!'] as const;

/** How long the bubble stays up (seconds, at the speed the tuk-tuk spawned at). */
export const BUBBLE_TIME = 1.0;
export const BUBBLE_H = 11;

export interface BubbleRect {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** Where the bubble's tail points (the tuk-tuk). */
  tailX: number;
}

/** A pseudo-random pick from the obstacle id, so it doesn't disturb the spawner's RNG. */
export function swearFor(id: number): string {
  return SWEARS[(Math.imul(id, 2654435761) >>> 0) % SWEARS.length];
}

/** Distance window in which the bubble shows: from the start of the swerve, for ~1 second. */
export function bubbleWindow(o: Obstacle): [number, number] | null {
  if (!Number.isFinite(o.dSwerve) || !Number.isFinite(o.dTell)) return null;
  // dSwerve − dTell is (tell seconds × spawn speed); recover the spawn speed from the swerve time.
  const speed = (o.dSwerveEnd - o.dSwerve) / TUK_SWERVE_TIME;
  return [o.dSwerve, o.dSwerve + BUBBLE_TIME * speed];
}

/**
 * Bubble placement at distance d. It sits behind the tuk-tuk (to its right) inside the lane the
 * tuk-tuk is leaving, so it never covers the lane it's moving into, and never covers the bus.
 */
export function bubbleRect(o: Obstacle, d: number, textWidth: (s: string) => number): BubbleRect | null {
  const win = bubbleWindow(o);
  if (!win || d < win[0] || d > win[1]) return null;
  const text = swearFor(o.id);
  const w = textWidth(text) + 6;
  const tukX = obstacleX(o, d);
  const minX = BUS_X + BUS_SPRITE_W + 3;
  const maxX = VIEW_W - w - 1;
  const x = Math.round(Math.max(minX, Math.min(maxX, tukX + KINDS.tuktuk.width + 3)));
  // Upper part of the origin lane's band (band is laneY ± LANE_HEIGHT/2).
  const y = Math.round(laneY(o.lane) - LANE_HEIGHT / 2 + 2);
  return { x, y, w, h: BUBBLE_H, text, tailX: Math.round(tukX + KINDS.tuktuk.width - 4) };
}
