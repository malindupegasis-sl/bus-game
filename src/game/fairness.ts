import { BUS_X, LANE_CHANGE_TIME, LANE_COUNT } from '../config';
import { BUS_HIT, KINDS, exitDistance, obstacleLane, obstacleX, type Obstacle } from './obstacles';

/**
 * Fairness model.
 *
 * Each obstacle "occupies" a lane during the distance window in which its hitbox overlaps the
 * bus's hitbox horizontally. A lane change takes LANE_CHANGE_TIME (plus margin) during which the
 * bus is treated as occupying BOTH lanes. A grid search over (distance, lane) then answers:
 * "starting in lane L now, can a player who reacts in time survive every known obstacle?"
 */
export const FAIRNESS = {
  /** Extra slack on lane-change duration in the safety check. */
  laneChangeMargin: 1.4,
  /** The bus can't be expected to start moving before this. */
  reactionTime: 0.22,
  /** Padding added to each end of every occupancy window. */
  padTime: 0.05,
  /** Grid resolution in distance units. */
  cell: 3,
} as const;

export interface Interval {
  lane: number;
  from: number;
  to: number;
}

const BUS_L = BUS_X + BUS_HIT.x0;
const BUS_R = BUS_X + BUS_HIT.x1;

/** Distance windows in which `o` could hit a bus in each lane. */
export function occupancy(o: Obstacle, speed: number): Interval[] {
  const k = KINDS[o.kind];
  const a = o.d0 + (o.x0 + k.hitX0 - BUS_R) / o.f;
  const b = o.d0 + (o.x0 + k.hitX1 - BUS_L) / o.f;
  const pad = FAIRNESS.padTime * speed;
  const out: Interval[] = [];
  const push = (lane: number, from: number, to: number) => {
    if (to > from) out.push({ lane, from: from - pad, to: to + pad });
  };
  if (o.toLane === o.lane || !Number.isFinite(o.dSwerve)) {
    push(o.lane, a, b);
  } else {
    // While swerving it counts as being in both lanes.
    push(o.lane, a, Math.min(b, o.dSwerveEnd));
    push(o.toLane, Math.max(a, o.dSwerve), b);
  }
  return out;
}

/**
 * Can a bus starting in `startLane` at distance `dNow` survive all `intervals`?
 * `speed` is a constant (callers pass a slightly pessimistic value) or a function of distance.
 */
export function hasSafePath(
  intervals: readonly Interval[],
  dNow: number,
  startLane: number,
  speed: number | ((d: number) => number),
  opts: { reaction?: boolean; laneChangeMargin?: number } = {},
): boolean {
  const speedAtD = typeof speed === 'number' ? () => speed : speed;
  const cell = FAIRNESS.cell;
  let end = dNow;
  for (const iv of intervals) if (iv.to > end) end = iv.to;
  const n = Math.max(1, Math.ceil((end - dNow) / cell) + 2);

  const blocked: Uint8Array[] = [];
  for (let l = 0; l < LANE_COUNT; l++) blocked.push(new Uint8Array(n));
  for (const iv of intervals) {
    if (iv.to < dNow) continue;
    const i0 = Math.max(0, Math.floor((iv.from - dNow) / cell));
    const i1 = Math.min(n - 1, Math.floor((iv.to - dNow) / cell));
    const row = blocked[iv.lane];
    for (let i = i0; i <= i1; i++) row[i] = 1;
  }

  // freeRun[l][i] = number of consecutive free cells starting at i (cells past the end are free).
  const freeRun: Int32Array[] = blocked.map((row) => {
    const r = new Int32Array(n + 1);
    r[n] = 1 << 30;
    for (let i = n - 1; i >= 0; i--) r[i] = row[i] ? 0 : r[i + 1] + 1;
    return r;
  });

  const margin = opts.laneChangeMargin ?? FAIRNESS.laneChangeMargin;
  const changeCells = (i: number) =>
    Math.max(1, Math.ceil((speedAtD(dNow + i * cell) * LANE_CHANGE_TIME * margin) / cell));
  const r = opts.reaction === false ? 0 : Math.ceil((speedAtD(dNow) * FAIRNESS.reactionTime) / cell);

  if (blocked[startLane][0]) return false;
  const reach = new Uint8Array(n);
  reach[0] = 1 << startLane;
  for (let i = 0; i < n; i++) {
    const mask = reach[i];
    if (!mask) continue;
    if (i === n - 1) return true;
    for (let l = 0; l < LANE_COUNT; l++) {
      if (!(mask & (1 << l))) continue;
      if (!blocked[l][i + 1]) reach[i + 1] |= 1 << l;
      if (i < r) continue;
      const k = changeCells(i);
      for (const nl of [l - 1, l + 1]) {
        if (nl < 0 || nl >= LANE_COUNT) continue;
        if (freeRun[l][i] > k && freeRun[nl][i] > k) {
          if (i + k >= n - 1) return true;
          reach[i + k] |= 1 << nl;
        }
      }
    }
  }
  return false;
}

/** For each lane: can a bus starting there survive? */
export function lanesWithPath(intervals: readonly Interval[], dNow: number, speed: number): boolean[] {
  const out: boolean[] = [];
  for (let l = 0; l < LANE_COUNT; l++) out.push(hasSafePath(intervals, dNow, l, speed));
  return out;
}

/** Would two obstacles visibly drive through each other while both are on screen? */
export function screenConflict(a: Obstacle, b: Obstacle, gap = 6): boolean {
  const start = Math.max(a.d0, b.d0);
  const end = Math.min(exitDistance(a), exitDistance(b));
  const wa = KINDS[a.kind].width;
  const wb = KINDS[b.kind].width;
  for (let d = start; d <= end; d += FAIRNESS.cell) {
    if (Math.abs(obstacleLane(a, d) - obstacleLane(b, d)) >= 0.95) continue;
    const xa = obstacleX(a, d);
    const xb = obstacleX(b, d);
    if (xa < xb + wb + gap && xb < xa + wa + gap) return true;
  }
  return false;
}
