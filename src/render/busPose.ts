import { LANE_HALF_DOWN, LANE_HALF_UP, VEHICLE_BASELINE } from '../config';
import { BUS_BODY_H, BUS_WHEELS, SPRITES } from './sprites';

export const BUS_W = SPRITES.bus[0].length; // 74

/** Lane-change animation strengths. */
export const TILT_MAX = 3; // px the nose rises (moving up) or dips (moving down) mid-change
export const STRETCH = { x: 0.05, y: 0.09 } as const; // mid-change: a little narrower and taller
export const SQUASH = { x: 0.06, y: 0.1, time: 0.16 } as const; // on landing: wider and shorter

export interface BusPose {
  /** Nose offset in px (negative = up). The rear stays put; the body shears linearly. */
  tilt: number;
  scaleX: number;
  scaleY: number;
  /** Suspension: body sinks 1px now and then while cruising. */
  bounce: number;
  wheelFrame: number;
  glow: number;
  /** Wheel-centre row and the body's bottom row with no tilt/scale (screen y). */
  wheelY: number;
  bodyBottom: number;
}

export interface Column {
  /** Source column in the sprite and its destination rect on screen. */
  sx: number;
  dx: number;
  dw: number;
  dy: number;
  dh: number;
}

/**
 * Animation pose of the player's bus.
 * - Settled: inside its own lane (laneY − 16 … laneY + 16).
 * - Changing lanes: tilts up to 3px, stretches, and stays between the two lanes it's crossing.
 * - Landing: a short squash, inside the new lane.
 */
export function busPose(o: {
  laneY: number;
  /**
   * Rows the bus may use (inclusive). While changing lanes this is from the lane it's in to the
   * lane it's heading for; tilt and stretch are reduced to stay inside. Defaults to its own lane.
   */
  limits?: { top: number; bottom: number };
  d: number;
  moveDir: number;
  moveProgress: number;
  sinceArrival: number;
  live: boolean;
  now: number;
}): BusPose {
  const wheelY = Math.round(o.laneY) + VEHICLE_BASELINE - BUS_WHEELS.r;
  const bodyBottom = wheelY - BUS_WHEELS.y + BUS_BODY_H - 1;
  let tilt = 0;
  let scaleX = 1;
  let scaleY = 1;
  let bounce = 0;
  if (o.moveDir !== 0 && o.moveProgress < 1) {
    // Peaks a quarter of the way in, while the bus is moving fastest and far from the new lane.
    const k = Math.sin(Math.PI * Math.sqrt(o.moveProgress));
    tilt = o.moveDir * Math.round(TILT_MAX * k);
    scaleX = 1 - STRETCH.x * k;
    scaleY = 1 + STRETCH.y * k;
  } else if (o.sinceArrival < SQUASH.time) {
    const k = Math.sin((Math.PI * o.sinceArrival) / SQUASH.time);
    scaleX = 1 + SQUASH.x * k;
    scaleY = 1 - SQUASH.y * k;
  } else if (o.live && Math.sin(o.d * 0.085) + 0.5 * Math.sin(o.d * 0.23) > 0.9) {
    bounce = 1;
  }
  const wheelFrame = o.live ? Math.floor(o.d / 3) % 4 : 0;
  const glow = (Math.imul(Math.floor(o.now * 12), 2654435761) >>> 0) % 4;
  const pose = { tilt, scaleX, scaleY, bounce, wheelFrame, glow, wheelY, bodyBottom };

  // Never leave the allowed rows: ease off the tilt first, then the stretch.
  const lim = o.limits ?? {
    top: Math.round(o.laneY) - LANE_HALF_UP,
    bottom: Math.round(o.laneY) + LANE_HALF_DOWN,
  };
  for (let i = 0; i < 20; i++) {
    const e = busExtent(pose, 0);
    const over = e.top < lim.top;
    const under = e.bottom > lim.bottom;
    if (!over && !under) break;
    if (under && pose.tilt > 0) pose.tilt--;
    else if (over && pose.tilt < 0) pose.tilt++;
    else if (over && pose.scaleY > 1) {
      pose.scaleY = Math.max(1, pose.scaleY - 0.02);
      pose.scaleX = Math.min(1, pose.scaleX + 0.012);
    } else if (pose.bounce) pose.bounce = 0;
    else break;
  }
  return pose;
}

/** Rows a bus at fractional lane `pos`, heading for lane `target`, may use. */
export function busLimits(laneYOf: (lane: number) => number, pos: number, target: number) {
  return {
    top: Math.round(laneYOf(Math.min(pos, target))) - LANE_HALF_UP,
    bottom: Math.round(laneYOf(Math.max(pos, target))) + LANE_HALF_DOWN,
  };
}

const tiltAt = (p: BusPose, x: number) => Math.round((p.tilt * x) / (BUS_W - 1));
const left = (p: BusPose, busX: number, x: number) => busX + BUS_W / 2 + (x - BUS_W / 2) * p.scaleX;

/** Where each sprite column is drawn. Columns that squash to zero width are skipped. */
export function busColumns(p: BusPose, busX: number): Column[] {
  const dh = Math.round(BUS_BODY_H * p.scaleY);
  const cols: Column[] = [];
  for (let x = 0; x < BUS_W; x++) {
    const dx = Math.round(left(p, busX, x));
    const dw = Math.round(left(p, busX, x + 1)) - dx;
    if (dw <= 0) continue;
    cols.push({ sx: x, dx, dw, dy: p.bodyBottom - dh + 1 + tiltAt(p, x) + p.bounce, dh });
  }
  return cols;
}

/** Wheel centres (they tilt with the body; bounce is the suspension, so wheels stay down). */
export function busWheels(p: BusPose, busX: number): { x: number; y: number }[] {
  return BUS_WHEELS.xs.map((wx) => ({ x: Math.round(left(p, busX, wx + 0.5) - 0.5), y: p.wheelY + tiltAt(p, wx) }));
}

/**
 * Bounding box of everything the bus draws in this pose. Computed directly (no allocation): the
 * tilt is linear from the rear (0) to the nose (tilt), so its extremes are at the two ends.
 */
export function busExtent(p: BusPose, busX: number): { top: number; bottom: number; left: number; right: number } {
  const dh = Math.round(BUS_BODY_H * p.scaleY);
  const r = BUS_WHEELS.r;
  let wheelBottom = -Infinity;
  let wheelLeft = Infinity;
  let wheelRight = -Infinity;
  for (const wx of BUS_WHEELS.xs) {
    const cx = Math.round(left(p, busX, wx + 0.5) - 0.5);
    wheelBottom = Math.max(wheelBottom, p.wheelY + tiltAt(p, wx) + r);
    wheelLeft = Math.min(wheelLeft, cx - r);
    wheelRight = Math.max(wheelRight, cx + r);
  }
  return {
    top: p.bodyBottom - dh + 1 + p.bounce + Math.min(0, p.tilt),
    bottom: Math.max(p.bodyBottom + p.bounce + Math.max(0, p.tilt), wheelBottom),
    left: Math.min(Math.round(left(p, busX, 0)), wheelLeft),
    right: Math.max(Math.round(left(p, busX, BUS_W)) - 1, wheelRight),
  };
}

export interface Group {
  sx: number;
  sw: number;
  dx: number;
  dw: number;
  dy: number;
  dh: number;
}

const groups: Group[] = Array.from({ length: TILT_MAX * 2 + 2 }, () => ({ sx: 0, sw: 0, dx: 0, dw: 0, dy: 0, dh: 0 }));

/**
 * The body as a few runs of columns that share a vertical offset (one run when level), each drawn
 * with a single scaled drawImage. Returns a reused array: don't keep it across frames.
 */
export function busGroups(p: BusPose, busX: number): Group[] {
  const dh = Math.round(BUS_BODY_H * p.scaleY);
  const base = p.bodyBottom - dh + 1 + p.bounce;
  let n = 0;
  let start = 0;
  for (let x = 1; x <= BUS_W; x++) {
    if (x < BUS_W && tiltAt(p, x) === tiltAt(p, start)) continue;
    const g = groups[n++];
    g.sx = start;
    g.sw = x - start;
    g.dx = Math.round(left(p, busX, start));
    g.dw = Math.round(left(p, busX, x)) - g.dx;
    g.dy = base + tiltAt(p, start);
    g.dh = dh;
    start = x;
  }
  return groups.slice(0, n).filter((g) => g.dw > 0);
}

export const LANE_BAND = { up: LANE_HALF_UP, down: LANE_HALF_DOWN } as const;
