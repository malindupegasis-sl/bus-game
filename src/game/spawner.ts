import { LANE_COUNT, SPAWN_X } from '../config';
import { CONVOY_COOLDOWN, kindWeightsAt, maxObstaclesAt, spawnGapAt, speedAt } from './difficulty';
import { keepsPickupsSafe, type Pickup } from './pickups';
import { lanesWithPath, occupancy, screenConflict, type Interval } from './fairness';
import {
  KINDS, TUK_MIN_TELL_TIME, TUK_SWERVE_CHANCE, TUK_SWERVE_MIN_X, TUK_SWERVE_TIME, TUK_TELL_MAX_X, TUK_TELL_TIME,
  type Obstacle, type ObstacleKind,
} from './obstacles';
import { randInt, randRange, type Rng } from './rng';

export interface SpawnerState {
  nextSpawnD: number;
  nextId: number;
  /** Play time of the last convoy (for the cooldown). */
  lastConvoyT: number;
}

export function createSpawner(firstSpawnD = 60): SpawnerState {
  return { nextSpawnD: firstSpawnD, nextId: 1, lastConvoyT: -Infinity };
}

/** How far ahead (seconds) the spawner looks when picking a pessimistic speed. */
const SPEED_LOOKAHEAD = 2;
const MAX_ATTEMPTS = 8;

function pickKind(rng: Rng, t: number): ObstacleKind {
  const w = kindWeightsAt(t);
  const kinds = Object.keys(w) as ObstacleKind[];
  const total = kinds.reduce((s, k) => s + w[k], 0);
  let x = rng() * total;
  for (const k of kinds) {
    x -= w[k];
    if (x < 0) return k;
  }
  return 'lorry';
}

export function makeObstacle(
  id: number,
  kind: ObstacleKind,
  lane: number,
  d: number,
  speed: number,
  rng: Rng,
): Obstacle {
  const [fMin, fMax] = KINDS[kind].speedFactor;
  const f = randRange(rng, fMin, fMax);
  const o: Obstacle = {
    id, kind, d0: d, x0: SPAWN_X, f, lane, toLane: lane,
    dTell: Infinity, dSwerve: Infinity, dSwerveEnd: Infinity,
  };
  if (kind === 'tuktuk' && rng() < TUK_SWERVE_CHANCE) {
    // Swerve once: the whole tell must be visible, and the swerve must start in the right half.
    // The tell is 0.7s when it fits and shortens (to no less than 0.42s) only when it must.
    const room = TUK_TELL_MAX_X - TUK_SWERVE_MIN_X; // screen px available for the tell
    const tellTime = Math.min(TUK_TELL_TIME, room / (speed * f));
    if (tellTime >= TUK_MIN_TELL_TIME) {
      const maxX = TUK_TELL_MAX_X - tellTime * speed * f;
      o.toLane = lane === 0 ? 1 : lane === LANE_COUNT - 1 ? lane - 1 : lane + (rng() < 0.5 ? -1 : 1);
      const swerveX = randRange(rng, TUK_SWERVE_MIN_X, maxX);
      o.dSwerve = d + (SPAWN_X - swerveX) / f;
      o.dTell = o.dSwerve - tellTime * speed;
      o.dSwerveEnd = o.dSwerve + TUK_SWERVE_TIME * speed;
    }
  }
  return o;
}

export interface SpawnContext {
  d: number;
  t: number;
  obstacles: readonly Obstacle[];
  rng: Rng;
  /** Lane the bus is in (or heading to). Spawns must keep a survivable path from here. */
  busLane?: number;
  /** Pickups on the road: new traffic must never make collecting one force a crash. */
  pickups?: readonly Pickup[];
}

/** At most this many motorbikes at once, and never two in the same lane on screen. */
const MAX_BIKES = 2;

function kindAllowed(kind: ObstacleKind, lane: number, obstacles: readonly Obstacle[], t: number, s: SpawnerState): boolean {
  if (kind === 'convoy') return t - s.lastConvoyT >= CONVOY_COOLDOWN && !obstacles.some((o) => o.kind === 'convoy');
  if (kind === 'rival') return !obstacles.some((o) => o.kind === 'rival');
  if (kind !== 'bike') return true;
  const bikes = obstacles.filter((o) => o.kind === 'bike');
  return bikes.length < MAX_BIKES && !bikes.some((o) => o.lane === lane);
}

/**
 * Maybe spawn one obstacle. A candidate is only accepted if
 *  - the bus, from the lane it is actually in, can still get through everything on the road, and
 *  - every lane from which the bus could survive before can still survive afterwards.
 * So a spawn never closes the last gap.
 */
export function updateSpawner(s: SpawnerState, ctx: SpawnContext): Obstacle | null {
  const { d, t, obstacles, rng, busLane, pickups } = ctx;
  if (d < s.nextSpawnD) return null;
  const speedNow = speedAt(t);
  const speedSafe = speedAt(t + SPEED_LOOKAHEAD);

  if (obstacles.length >= maxObstaclesAt(t)) {
    s.nextSpawnD = d + 0.1 * speedNow;
    return null;
  }

  const base: Interval[] = [];
  for (const o of obstacles) for (const iv of occupancy(o, speedSafe)) if (iv.to > d) base.push(iv);
  const before = lanesWithPath(base, d, speedSafe);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const kind = pickKind(rng, t);
    const lane = randInt(rng, 0, LANE_COUNT - 1);
    if (!kindAllowed(kind, lane, obstacles, t, s)) continue;
    const cand = makeObstacle(s.nextId, kind, lane, d, speedNow, rng);
    if (obstacles.some((o) => screenConflict(o, cand))) continue;
    const after = lanesWithPath([...base, ...occupancy(cand, speedSafe)], d, speedSafe);
    if (!after.some(Boolean)) continue;
    if (busLane !== undefined && !after[busLane]) continue;
    if (before.some((ok, l) => ok && !after[l])) continue;
    if (pickups && !keepsPickupsSafe(pickups, d, [...base, ...occupancy(cand, speedSafe)], cand, speedSafe)) continue;
    if (kind === 'convoy') s.lastConvoyT = t;
    s.nextId++;
    s.nextSpawnD = d + spawnGapAt(t) * speedNow * randRange(rng, 0.7, 1.3);
    return cand;
  }
  s.nextSpawnD = d + 0.12 * speedNow;
  return null;
}
