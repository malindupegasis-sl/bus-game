import { describe, expect, it } from 'vitest';
import { LANE_COUNT, laneY } from '../src/config';
import { speedAt } from '../src/game/difficulty';
import { hasSafePath, occupancy } from '../src/game/fairness';
import {
  TUK_MIN_TELL_TIME, TUK_SWERVE_CHANCE, TUK_SWERVE_MIN_X, TUK_TELL_MAX_X, TUK_TELL_TIME,
  exitDistance, obstacleLane, obstacleX, type Obstacle,
} from '../src/game/obstacles';
import { createRng } from '../src/game/rng';
import { createSpawner, makeObstacle, updateSpawner } from '../src/game/spawner';
import { World } from '../src/game/world';

const DT = 1 / 60;
const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 13);

/** Verify against a lane change 20% slower than the real animation, with no reaction delay. */
const VERIFY = { reaction: false, laneChangeMargin: 1.2 } as const;

/** Run only the spawner for `seconds` with the bus parked in `busLane`. */
function simulate(seed: number, seconds: number, busLane = 1) {
  const rng = createRng(seed);
  const s = createSpawner();
  let d = 0;
  let t = 0;
  let live: Obstacle[] = [];
  const all: { o: Obstacle; t: number }[] = [];
  while (t < seconds) {
    t += DT;
    d += speedAt(t) * DT;
    const o = updateSpawner(s, { d, t, obstacles: live, rng, busLane });
    if (o) {
      live.push(o);
      all.push({ o, t });
    }
    live = live.filter((x) => d < exitDistance(x));
  }
  return all;
}

/**
 * A perfect-but-lazy bot: it only moves when the lane it's in has no safe path left, then moves
 * to an adjacent lane that has one. Returns the finished world.
 */
function runBot(seed: number, seconds: number, onStep?: (w: World) => void): World {
  const w = new World(seed);
  while (w.t < seconds && !w.crashed) {
    if (!w.bus.moving) {
      const ivs = w.obstacles.flatMap((o) => occupancy(o, w.speed));
      const cur = w.bus.target;
      if (!hasSafePath(ivs, w.d, cur, w.speed, VERIFY)) {
        for (const dir of [-1, 1] as const) {
          const nl = cur + dir;
          if (nl < 0 || nl >= LANE_COUNT) continue;
          if (hasSafePath(ivs, w.d, nl, w.speed, VERIFY)) {
            w.move(dir);
            break;
          }
        }
      }
    }
    w.step(DT);
    onStep?.(w);
  }
  return w;
}

describe('spawner fairness', () => {
  it('spawns a meaningful amount of traffic of every kind', () => {
    const all = simulate(42, 120);
    expect(all.length).toBeGreaterThan(60);
    expect(new Set(all.map((a) => a.o.kind))).toEqual(new Set(['lorry', 'tuktuk', 'bike']));
  });

  it('never blocks all 3 lanes at the same moment', () => {
    for (const seed of SEEDS) {
      for (const busLane of [0, 1, 2]) {
        if (busLane !== 1 && seed % 5) continue; // all seeds in the middle lane, some at the edges
        const ivs = simulate(seed, 150, busLane).flatMap(({ o, t }) => occupancy(o, speedAt(t)));
        const events = ivs.flatMap((iv) => [
          { d: iv.from, lane: iv.lane, delta: 1 },
          { d: iv.to, lane: iv.lane, delta: -1 },
        ]);
        events.sort((a, b) => a.d - b.d || a.delta - b.delta);
        const cover = new Array(LANE_COUNT).fill(0);
        for (const e of events) {
          cover[e.lane] += e.delta;
          expect(cover.every((c) => c > 0), `seed ${seed} lane ${busLane} d=${e.d.toFixed(1)}`).toBe(false);
        }
      }
    }
  });

  it('always leaves a reachable gap: a perfect bot on the real World never crashes', () => {
    const count = { lorry: 0, tuktuk: 0, bike: 0 };
    let swerving = 0;
    for (const seed of SEEDS.slice(0, 120)) {
      let maxOnRoad = 0;
      const seen = new Set<number>();
      const w = runBot(seed, 150, (w) => {
        maxOnRoad = Math.max(maxOnRoad, w.obstacles.length);
        for (const o of w.obstacles) {
          if (seen.has(o.id)) continue;
          seen.add(o.id);
          count[o.kind]++;
          if (o.toLane !== o.lane) swerving++;
        }
      });
      expect(w.crashed, `seed ${seed} crashed at t=${w.t.toFixed(1)}`).toBe(false);
      expect(maxOnRoad).toBeGreaterThanOrEqual(4);
    }
    // Spawn mix (v1 was lorry 53.7%, tuk-tuk 22.9%, motorbike 23.3%).
    const total = count.lorry + count.tuktuk + count.bike;
    const share = (n: number) => n / total;
    expect(share(count.bike)).toBeGreaterThan(0.233 * 0.3); // cut by ~60%: 7–11.5%
    expect(share(count.bike)).toBeLessThan(0.233 * 0.5);
    expect(share(count.lorry)).toBeGreaterThan(0.57); // ~+7 points each
    expect(share(count.lorry)).toBeLessThan(0.65);
    expect(share(count.tuktuk)).toBeGreaterThan(0.26);
    expect(share(count.tuktuk)).toBeLessThan(0.34);
    // About half of the tuk-tuks on the road swerve.
    expect(swerving / count.tuktuk).toBeGreaterThan(0.4);
    expect(swerving / count.tuktuk).toBeLessThan(0.6);
  });

  it('a player who never steers does crash (the road is not trivially empty)', () => {
    let crashes = 0;
    for (const seed of SEEDS.slice(0, 30)) {
      const w = new World(seed);
      while (w.t < 90 && !w.crashed) w.step(DT);
      if (w.crashed) crashes++;
    }
    expect(crashes).toBe(30);
  });

  it('never puts two motorbikes in the same lane on screen, and at most two at once', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      runBot(seed, 120, (w) => {
        const bikes = w.obstacles.filter((o) => o.kind === 'bike');
        expect(new Set(bikes.map((b) => b.lane)).size).toBe(bikes.length);
        expect(bikes.length).toBeLessThanOrEqual(2);
      });
    }
  });

  it('occupancy windows cover every real collision (the fairness model is conservative)', () => {
    const rng = createRng(7);
    const w = new World(1);
    for (let n = 0; n < 1500; n++) {
      const kind = (['lorry', 'tuktuk', 'bike'] as const)[n % 3];
      const lane = n % LANE_COUNT;
      const speed = 110 + rng() * 120;
      const o = makeObstacle(1, kind, lane, 0, speed, rng);
      const ivs = occupancy(o, speed);
      w.obstacles = [o];
      for (let d = 0; d < exitDistance(o); d += 2) {
        for (const busPos of [0, 0.25, 0.5, 0.75, 1, 1.5, 2]) {
          w.d = d;
          w.bus.pos = busPos;
          if (!w.findCollision()) continue;
          // A bus between lanes counts as being in both neighbouring lanes.
          const lanes = new Set([Math.floor(busPos), Math.ceil(busPos)]);
          const covered = ivs.some((iv) => lanes.has(iv.lane) && iv.from <= d && d <= iv.to);
          expect(covered, `${kind} lane ${lane} d=${d} bus=${busPos}`).toBe(true);
        }
      }
    }
  });

  it('tuk-tuks: about half plan one swerve, after a fully visible tell, starting in the right half', () => {
    const rng = createRng(3);
    let planned = 0;
    let n = 0;
    for (const speed of [110, 140, 170, 200, 230]) {
      for (let i = 0; i < 400; i++, n++) {
        const o = makeObstacle(1, 'tuktuk', i % 3, 0, speed, rng);
        if (o.toLane === o.lane) {
          expect(o.dSwerve).toBe(Infinity); // stays in its lane the whole way
          expect(obstacleLane(o, 1e6)).toBe(o.lane);
          continue;
        }
        planned++;
        expect(Math.abs(o.toLane - o.lane)).toBe(1); // one lane, once
        const tell = (o.dSwerve - o.dTell) / speed;
        expect(tell).toBeGreaterThanOrEqual(TUK_MIN_TELL_TIME - 1e-9);
        expect(tell).toBeLessThanOrEqual(TUK_TELL_TIME + 1e-9);
        // The full 0.7s tell whenever it fits on screen.
        if ((TUK_TELL_MAX_X - TUK_SWERVE_MIN_X) / (speed * o.f) >= TUK_TELL_TIME) expect(tell).toBeCloseTo(TUK_TELL_TIME);
        expect(obstacleX(o, o.dTell)).toBeLessThanOrEqual(TUK_TELL_MAX_X + 1e-6); // tell fully visible
        expect(obstacleX(o, o.dSwerve) + 12).toBeGreaterThanOrEqual(128 - 1e-6); // swerve starts in right half
        expect(obstacleLane(o, o.dSwerveEnd + 1)).toBe(o.toLane);
        expect(laneY(obstacleLane(o, 0))).toBe(laneY(o.lane));
      }
    }
    expect(planned / n).toBeGreaterThan(TUK_SWERVE_CHANCE - 0.06);
    expect(planned / n).toBeLessThan(TUK_SWERVE_CHANCE + 0.06);
  });

  it('the tell is the full 0.7s at the start speed', () => {
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) {
      const o = makeObstacle(1, 'tuktuk', 1, 0, 110, rng);
      if (o.toLane !== o.lane) expect((o.dSwerve - o.dTell) / 110).toBeCloseTo(0.7);
    }
  });
});
