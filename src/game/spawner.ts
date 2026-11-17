import { LANE_COUNT, SPAWN_X } from '../config';
import { CONVOY_SCHEDULE, DIFFICULTY, kindWeightsAt, maxObstaclesAt, spawnGapAt, speedAt } from './difficulty';
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
  /** Play time of the last convoy, when the next one is due, and the next distance to try one. */
  lastConvoyT: number;
  nextConvoyT: number;
  nextConvoyTryD: number;
}

export function createSpawner(firstSpawnD = 60): SpawnerState {
  return { nextSpawnD: firstSpawnD, nextId: 1, lastConvoyT: -Infinity, nextConvoyT: CONVOY_SCHEDULE.first, nextConvoyTryD: 0 };
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

function kindAllowed(kind: ObstacleKind, lane: number, obstacles: readonly Obstacle[]): boolean {
  if (kind === 'convoy') return false; // only ever spawned by the schedule
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
  const speedNow = speedAt(t);
  const speedSafe = speedAt(t + SPEED_LOOKAHEAD);

  const base: Interval[] = [];
  let before: boolean[] | null = null;
  const prepare = () => {
    if (before) return before;
    for (const o of obstacles) for (const iv of occupancy(o, speedSafe)) if (iv.to > d) base.push(iv);
    before = lanesWithPath(base, d, speedSafe);
    return before;
  };
  /** The fairness rules every new vehicle must pass. */
  const fair = (cand: Obstacle): boolean => {
    const b = prepare();
    if (obstacles.some((o) => screenConflict(o, cand))) return false;
    const withCand = [...base, ...occupancy(cand, speedSafe)];
    const after = lanesWithPath(withCand, d, speedSafe);
    if (!after.some(Boolean)) return false;
    if (busLane !== undefined && !after[busLane]) return false;
    if (b.some((ok, l) => ok && !after[l])) return false;
    if (pickups && !keepsPickupsSafe(pickups, d, withCand, cand, speedSafe)) return false;
    return true;
  };

  // Scheduled politician's convoy (it may go one over the usual vehicle cap).
  const convoyDue =
    t >= s.nextConvoyT && t >= DIFFICULTY.warmupTime && t - s.lastConvoyT >= CONVOY_SCHEDULE.minGap &&
    !obstacles.some((o) => o.kind === 'convoy');
  if (convoyDue && d >= s.nextConvoyTryD) {
    s.nextConvoyTryD = d + 0.1 * speedNow;
    const start = randInt(rng, 0, LANE_COUNT - 1);
    for (let i = 0; i < LANE_COUNT; i++) {
      const cand = makeObstacle(s.nextId, 'convoy', (start + i) % LANE_COUNT, d, speedNow, rng);
      if (!fair(cand)) continue;
      s.nextId++;
      s.lastConvoyT = t;
      s.nextConvoyT = t + CONVOY_SCHEDULE.every + randRange(rng, -CONVOY_SCHEDULE.jitter, CONVOY_SCHEDULE.jitter);
      s.nextSpawnD = Math.max(s.nextSpawnD, d + 0.5 * speedNow);
      return cand;
    }
  }

  if (d < s.nextSpawnD) return null;
  if (obstacles.length >= maxObstaclesAt(t)) {
    s.nextSpawnD = d + 0.1 * speedNow;
    return null;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const kind = pickKind(rng, t);
    const lane = randInt(rng, 0, LANE_COUNT - 1);
    if (!kindAllowed(kind, lane, obstacles)) continue;
    const cand = makeObstacle(s.nextId, kind, lane, d, speedNow, rng);
    if (!fair(cand)) continue;
    s.nextId++;
    s.nextSpawnD = d + spawnGapAt(t) * speedNow * randRange(rng, 0.7, 1.3);
    return cand;
  }
  s.nextSpawnD = d + 0.12 * speedNow;
  return null;
}
