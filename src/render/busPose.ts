import { LANE_HEIGHT, VEHICLE_BASELINE } from '../config';
import { BUS_BODY_H, BUS_WHEELS, SPRITES } from './sprites';

export const BUS_W = SPRITES.bus[0].length; // 62
/** Door pillar column: the front section leans as one piece from here. */
export const LEAN_SEAM_X = 40;

export interface BusPose {
  /** Vertical offset of each body column (−1 up … +1 down): suspension bounce + lane-change lean. */
  columnOffset: number[];
  /** Body top row (screen y) before offsets. */
  bodyTop: number;
  /** Wheel centre row (screen y). */
  wheelY: number;
  /** 0–3: which way the wheel spokes point. */
  wheelFrame: number;
  /** Index into BUS_GLOW. */
  glow: number;
}

/**
 * Animation pose of the player's bus. Everything stays inside the bus's lane band
 * (laneY − 14 … laneY + 13): the body moves at most 1px up or down, the wheels don't move.
 */
export function busPose(opts: {
  laneY: number;
  /** Bus distance travelled (drives wheel spin and bounce). */
  d: number;
  /** −1 moving up, +1 moving down, 0 settled. */
  leanDir: number;
  /** Whether the road is moving (no bounce/spin after a crash or on pause). */
  live: boolean;
  /** Seconds, for the glow flicker. */
  now: number;
}): BusPose {
  const { laneY, d, leanDir, live, now } = opts;
  const wheelY = laneY + VEHICLE_BASELINE - BUS_WHEELS.r;
  const bodyTop = wheelY - BUS_WHEELS.y;
  // Suspension: a short 1px lift every so often, a little irregular.
  const bounce = live && Math.sin(d * 0.085) + 0.5 * Math.sin(d * 0.23) > 0.9 ? -1 : 0;
  const columnOffset: number[] = [];
  for (let x = 0; x < BUS_W; x++) {
    // Lean: the front section (from the door pillar forward) rises 1px when moving up a lane and
    // dips 1px when moving down. A single step at the door seam reads as a tilt, not a break.
    const lean = leanDir !== 0 && x >= LEAN_SEAM_X ? leanDir : 0;
    columnOffset.push(Math.max(-1, Math.min(1, bounce + lean)));
  }
  const wheelFrame = live ? Math.floor(d / 3) % 4 : 0;
  // Flicker: hold each level for 1/12 s, picked pseudo-randomly.
  const tick = Math.floor(now * 12);
  const glow = (Math.imul(tick, 2654435761) >>> 0) % 4;
  return { columnOffset, bodyTop, wheelY, wheelFrame, glow };
}

/** Topmost and bottommost screen rows the bus can occupy in this pose. */
export function busExtent(p: BusPose): { top: number; bottom: number } {
  return {
    top: p.bodyTop + Math.min(...p.columnOffset),
    bottom: Math.max(p.bodyTop + BUS_BODY_H - 1 + Math.max(...p.columnOffset), p.wheelY + BUS_WHEELS.r),
  };
}

export const LANE_BAND = { top: -LANE_HEIGHT / 2, bottom: LANE_HEIGHT / 2 - 1 } as const;
