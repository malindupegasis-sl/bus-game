import { BUS_X, LANE_COUNT, SPAWN_X } from '../config';
import { speedAt } from './difficulty';
import { FAIRNESS, hasSafePath, occupancy, type Interval } from './fairness';
import { BUS_HIT, KINDS, exitDistance, obstacleLane, obstacleX, type Obstacle } from './obstacles';
import { randInt, randRange, type Rng } from './rng';

export type PickupKind = 'chilli' | 'lime';

/** Pickups lie on the road: they scroll with it (1 screen px per unit of distance). */
export interface Pickup {
  id: number;
  kind: PickupKind;
  lane: number;
  d0: number;
  x0: number;
  collected: boolean;
}

export const PICKUP_W = 10;
/** Seconds between pickups (randomised in this range), and the first one of a run. */
export const CHILLI_EVERY: [number, number] = [6, 10];
export const LIME_AFTER: [number, number] = [2.5, 4];
export const FIRST_PICKUP_AT = 5;

export const pickupX = (p: Pickup, d: number) => p.x0 - (d - p.d0);
export const pickupGone = (p: Pickup, d: number) => p.collected || pickupX(p, d) + PICKUP_W < -4;

/** Distance window in which the pickup overlaps the bus's hitbox horizontally (when it can be collected). */
export function collectWindow(p: Pickup): [number, number] {
  return [p.d0 + (p.x0 - (BUS_X + BUS_HIT.x1)), p.d0 + (p.x0 + PICKUP_W - (BUS_X + BUS_HIT.x0))];
}

/** The bus collects a pickup when it overlaps it horizontally and is (mostly) in its lane. */
export function touches(p: Pickup, d: number, busPos: number): boolean {
  const [a, b] = collectWindow(p);
  return !p.collected && d >= a && d <= b && Math.abs(busPos - p.lane) <= 0.5;
}

/**
 * "Collecting it never forces a crash": nothing occupies the pickup's lane around the moment it
 * can be collected, and from that lane at that moment a bus can still get through everything.
 */
export function pickupIsSafe(p: Pickup, intervals: readonly Interval[], speed: number): boolean {
  const [a, b] = collectWindow(p);
  const pad = FAIRNESS.padTime * speed + speed * 0.15;
  for (const iv of intervals) if (iv.lane === p.lane && iv.from < b + pad && iv.to > a - pad) return false;
  return hasSafePath(intervals, a, p.lane, speed, { reaction: false });
}

/** Would a vehicle drive over the pickup while both are on screen? (Looks wrong, so avoid it.) */
export function overlapsOnScreen(p: Pickup, o: Obstacle): boolean {
  const start = Math.max(p.d0, o.d0);
  const end = Math.min(exitDistance(o), p.d0 + p.x0 + PICKUP_W + 4);
  const w = KINDS[o.kind].width;
  for (let d = start; d <= end; d += FAIRNESS.cell) {
    if (Math.abs(obstacleLane(o, d) - p.lane) >= 0.95) continue;
    const ox = obstacleX(o, d);
    const px = pickupX(p, d);
    if (ox < px + PICKUP_W + 2 && px < ox + w + 2) return true;
  }
  return false;
}

export interface PickupSpawner {
  nextD: number;
  nextId: number;
}

export const createPickupSpawner = (): PickupSpawner => ({ nextD: FIRST_PICKUP_AT * speedAt(0), nextId: 1 });

/** Spawn the next chilli or lime when it's due and a safe lane exists. */
export function updatePickups(
  s: PickupSpawner,
  ctx: { d: number; t: number; want: PickupKind | null; pickups: readonly Pickup[]; obstacles: readonly Obstacle[]; rng: Rng },
): Pickup | null {
  const { d, t, want, pickups, obstacles, rng } = ctx;
  if (!want || d < s.nextD) return null;
  if (pickups.some((p) => !pickupGone(p, d))) return null;
  const speedSafe = speedAt(t + 2);
  const speedNow = speedAt(t);
  const intervals = obstacles.flatMap((o) => occupancy(o, speedSafe));
  const start = randInt(rng, 0, LANE_COUNT - 1);
  for (let i = 0; i < LANE_COUNT; i++) {
    const lane = (start + i) % LANE_COUNT;
    const p: Pickup = { id: s.nextId, kind: want, lane, d0: d, x0: SPAWN_X, collected: false };
    if (!pickupIsSafe(p, intervals, speedSafe)) continue;
    if (obstacles.some((o) => overlapsOnScreen(p, o))) continue;
    s.nextId++;
    const [lo, hi] = want === 'chilli' ? CHILLI_EVERY : LIME_AFTER;
    s.nextD = d + randRange(rng, lo, hi) * speedNow;
    return p;
  }
  s.nextD = d + 0.3 * speedNow;
  return null;
}

/** For the spawner: would this new vehicle break any pending pickup's safety? */
export function keepsPickupsSafe(
  pickups: readonly Pickup[],
  d: number,
  intervals: readonly Interval[],
  candidate: Obstacle,
  speed: number,
): boolean {
  for (const p of pickups) {
    if (p.collected || collectWindow(p)[1] < d) continue;
    if (overlapsOnScreen(p, candidate)) return false;
    if (!pickupIsSafe(p, intervals, speed)) return false;
  }
  return true;
}
