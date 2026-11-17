import { describe, expect, it } from 'vitest';
import { BUS_X, LANE_COUNT, SPAWN_X } from '../src/config';
import { CAPTIONS, CONDUCTOR_SHOUTS, OVERTAKE_BONUS, PROMISES } from '../src/game/captions';
import {
  BOOST_SCORE, BOOST_SPEED, BOOST_TIME, SAVE_INVINCIBLE_TIME, TRANSITION_TIME, collect, newCharm, nextPickup, onHit,
  tickCharm,
} from '../src/game/charm';
import { CONVOY_SCHEDULE, DIFFICULTY, speedAt } from '../src/game/difficulty';
import { hasSafePath, occupancy } from '../src/game/fairness';
import { CONVOY_LENGTH, KINDS, type Obstacle } from '../src/game/obstacles';
import { collectWindow, pickupIsSafe, type Pickup } from '../src/game/pickups';
import { World } from '../src/game/world';
import { FONT_BIG, FONT_SMALL } from '../src/render/sprites';

const DT = 1 / 60;
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 104729 + 7);

/** An obstacle parked right on top of the bus (to force a collision). */
function onTheBus(w: World, id = 999): Obstacle {
  return {
    id, kind: 'lorry', d0: w.d, x0: BUS_X + 10, f: 0.001, lane: w.bus.target, toLane: w.bus.target,
    dTell: Infinity, dSwerve: Infinity, dSwerveEnd: Infinity,
  };
}

function safeBotStep(w: World, opts = { reaction: false, laneChangeMargin: 1.2 }): void {
  if (w.bus.moving) return;
  const ivs = w.obstacles.flatMap((o) => occupancy(o, w.speed));
  const cur = w.bus.target;
  if (hasSafePath(ivs, w.d, cur, w.speed, opts)) return;
  for (const dir of [-1, 1] as const) {
    const nl = cur + dir;
    if (nl >= 0 && nl < LANE_COUNT && hasSafePath(ivs, w.d, nl, w.speed, opts)) return void w.move(dir);
  }
}

describe('lime-and-chilli charm', () => {
  it('2 chillies hang the charm, then (and only then) a lime is offered; the lime starts the boost', () => {
    const c = newCharm();
    expect(nextPickup(c)).toBe('chilli');
    expect(collect(c, 'lime')).toEqual([]); // a lime before 2 chillies does nothing
    expect(collect(c, 'chilli')).toEqual(['chilli']);
    expect(nextPickup(c)).toBe('chilli');
    expect(collect(c, 'chilli')).toEqual(['chilli', 'charmHung']);
    expect(c.chillies).toBe(2);
    expect(nextPickup(c)).toBe('lime');
    expect(collect(c, 'chilli')).toEqual([]); // no third chilli
    expect(collect(c, 'lime')).toEqual(['boostStart']);
    expect(c.boostT).toBe(BOOST_TIME);
    expect(nextPickup(c)).toBeNull(); // nothing offered while boosted
  });

  it('after the boost the charm comes off and collecting starts again from zero', () => {
    const c = newCharm();
    collect(c, 'chilli');
    collect(c, 'chilli');
    collect(c, 'lime');
    const events: string[] = [];
    for (let t = 0; t < BOOST_TIME + TRANSITION_TIME + 0.1; t += DT) events.push(...tickCharm(c, DT));
    expect(events).toEqual(['boostEnd', 'boostOver']);
    expect(c.chillies).toBe(0);
    expect(nextPickup(c)).toBe('chilli');
  });

  it('lucky charm: saves one crash while hanging, then blinks invincible for 1.5 s, then crashes count', () => {
    const c = newCharm();
    expect(onHit(c)).toBe('crash'); // no charm
    collect(c, 'chilli');
    expect(onHit(c)).toBe('crash'); // 1 chilli isn't a charm yet
    collect(c, 'chilli');
    expect(onHit(c)).toBe('saved');
    expect(c.chillies).toBe(0); // fell off; collecting restarts
    expect(c.invincibleT).toBe(SAVE_INVINCIBLE_TIME);
    expect(onHit(c)).toBe('ignored'); // blinking
    for (let t = 0; t < SAVE_INVINCIBLE_TIME + 0.05; t += DT) tickCharm(c, DT);
    expect(onHit(c)).toBe('crash');
  });

  it('in the World: the charm saves a real collision and the run continues', () => {
    const w = new World(3);
    w.charm.chillies = 2;
    w.obstacles.push(onTheBus(w));
    w.step(DT);
    expect(w.crashed).toBe(false);
    expect(w.saves).toBe(1);
    expect(w.charm.chillies).toBe(0);
    expect(w.invincible).toBe(true);
    expect(w.drainEvents().some((e) => e.type === 'charm' && e.what === 'saved')).toBe(true);
    // Still inside the lorry while blinking: no crash.
    for (let t = 0; t < 1.0; t += DT) {
      w.obstacles = [onTheBus(w)];
      w.step(DT);
    }
    expect(w.crashed).toBe(false);
    // After the invincibility ends, the next hit is a crash.
    for (let t = 0; t < 0.6; t += DT) { w.obstacles = []; w.step(DT); }
    w.obstacles = [onTheBus(w)];
    w.step(DT);
    expect(w.crashed).toBe(true);
  });
});

describe('Dham Rajina Xpress boost', () => {
  it('lasts 6 s: invincible, road 1.3x, double score; then ~1 s transition back', () => {
    const w = new World(4, { pickups: false });
    for (let i = 0; i < 60; i++) w.step(DT);
    collect(w.charm, 'chilli');
    collect(w.charm, 'chilli');
    collect(w.charm, 'lime');
    const s0 = w.scoreDistance;
    const d0 = w.d;
    w.step(DT);
    expect(w.speed).toBeCloseTo(speedAt(w.t) * BOOST_SPEED, 6);
    expect((w.scoreDistance - s0) / (w.d - d0)).toBeCloseTo(BOOST_SCORE, 6);
    // Invincible: parked on a lorry for the whole boost and transition.
    let t = DT;
    while (t < BOOST_TIME + TRANSITION_TIME - 0.05) {
      w.obstacles = [onTheBus(w)];
      w.step(DT);
      t += DT;
    }
    expect(w.crashed).toBe(false);
    expect(w.charm.chillies).toBe(0);
    for (let i = 0; i < 10; i++) { w.obstacles = []; w.step(DT); }
    expect(w.speed).toBeCloseTo(speedAt(w.t), 6); // back to normal
    expect(w.invincible).toBe(false);
  });

  it('every phrase the conductor and the politician shout can be drawn in the 5×7 font', () => {
    for (const s of [...CONDUCTOR_SHOUTS, ...PROMISES]) for (const ch of s) expect(FONT_BIG[ch], `'${ch}' in "${s}"`).toBeDefined();
    expect(PROMISES).toContain('FREE BUS FOR ALL!!');
  });
});

describe("politician's convoy", () => {
  it('is 5 SUVs long; the first comes at ~30 s, then about every 35 s, never two within 20 s', () => {
    expect(CONVOY_LENGTH).toBe(5 * 32 + 4 * 2);
    expect(KINDS.convoy.width).toBe(CONVOY_LENGTH);
    expect(CONVOY_SCHEDULE).toMatchObject({ first: 30, every: 35, minGap: 20 });
    const firsts: number[] = [];
    const gaps: number[] = [];
    for (const seed of SEEDS) {
      const w = new World(seed, { pickups: false });
      const times: number[] = [];
      const seen = new Set<number>();
      while (w.t < 150 && !w.crashed) {
        safeBotStep(w);
        w.step(DT);
        for (const o of w.obstacles) {
          if (o.kind !== 'convoy' || seen.has(o.id)) continue;
          seen.add(o.id);
          times.push(w.t);
        }
      }
      expect(w.crashed, `seed ${seed}`).toBe(false);
      expect(times.length, `seed ${seed}: convoys by 150 s`).toBeGreaterThanOrEqual(3);
      for (const t of times) expect(t).toBeGreaterThanOrEqual(DIFFICULTY.warmupTime);
      firsts.push(times[0]);
      for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    }
    // First convoy: due at 30 s; it may wait a moment for a fair lane.
    for (const f of firsts) expect(f).toBeGreaterThanOrEqual(30);
    const onTime = firsts.filter((f) => f <= 33).length / firsts.length;
    expect(onTime).toBeGreaterThan(0.9);
    // Then about every 35 s, never within 20 s.
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(CONVOY_SCHEDULE.minGap);
    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(meanGap).toBeGreaterThan(33);
    expect(meanGap).toBeLessThan(39);
  });

  it('counts as one long lane block in the fairness model', () => {
    const o: Obstacle = {
      id: 1, kind: 'convoy', d0: 0, x0: SPAWN_X, f: 1.25, lane: 1, toLane: 1, dTell: Infinity, dSwerve: Infinity, dSwerveEnd: Infinity,
    };
    const ivs = occupancy(o, 150);
    expect(ivs).toHaveLength(1);
    expect(ivs[0].lane).toBe(1);
    const lorry = occupancy({ ...o, kind: 'lorry' }, 150)[0];
    expect(ivs[0].to - ivs[0].from).toBeGreaterThan((lorry.to - lorry.from) * 2);
  });

  it('stress test: a convoy every 20 s (the minimum), and a perfect bot still always has a way through', () => {
    const saved = { ...CONVOY_SCHEDULE };
    Object.assign(CONVOY_SCHEDULE, { first: 20, every: 20, jitter: 0 });
    try {
      let convoys = 0;
      for (const seed of SEEDS.slice(0, 30)) {
        const w = new World(seed, { pickups: false });
        const ids = new Set<number>();
        while (w.t < 150 && !w.crashed) {
          safeBotStep(w);
          w.step(DT);
          for (const o of w.obstacles) if (o.kind === 'convoy') ids.add(o.id);
        }
        expect(w.crashed, `seed ${seed} crashed at t=${w.t.toFixed(1)}`).toBe(false);
        convoys += ids.size;
      }
      expect(convoys).toBeGreaterThan(30 * 5);
    } finally {
      Object.assign(CONVOY_SCHEDULE, saved);
    }
  });
});

describe('rival buses', () => {
  function rivalAhead(w: World, lane: number): Obstacle {
    return { id: 777, kind: 'rival', d0: w.d, x0: 200, f: 0.55, lane, toLane: lane, dTell: Infinity, dSwerve: Infinity, dSwerveEnd: Infinity };
  }

  it('overtaking one gives +50 once, with an overtake event', () => {
    const w = new World(5, { pickups: false });
    w.obstacles = [rivalAhead(w, 0)];
    const before = w.score;
    const events = [];
    for (let i = 0; i < 60 * 8 && w.obstacles.some((o) => o.id === 777); i++) {
      w.obstacles = w.obstacles.filter((o) => o.id === 777);
      w.step(DT);
      events.push(...w.drainEvents().filter((e) => e.type === 'overtake'));
    }
    expect(w.crashed).toBe(false);
    expect(events).toHaveLength(1);
    expect(w.bonus).toBe(OVERTAKE_BONUS);
    expect(w.score - before).toBeGreaterThanOrEqual(OVERTAKE_BONUS);
  });

  it('no penalty: the bonus never goes down', () => {
    const w = new World(6, { pickups: false });
    let last = 0;
    for (let i = 0; i < 60 * 120 && !w.crashed; i++) {
      safeBotStep(w);
      w.step(DT);
      expect(w.bonus).toBeGreaterThanOrEqual(last);
      last = w.bonus;
    }
    expect(last % OVERTAKE_BONUS).toBe(0);
  });
});

describe('pickups never force a crash', () => {
  it('every chilli and lime: its lane is clear when you collect it, and you can get through all traffic', () => {
    // Checked against every vehicle that spawned until the pickup was collected (or passed by).
    // After you collect it, the general rule takes over: new traffic never traps your actual lane.
    let checked = 0;
    let laterTraffic = 0;
    for (const seed of SEEDS) {
      const w = new World(seed);
      const all: { o: Obstacle; speed: number }[] = [];
      const ids = new Set<number>();
      const tracked: { p: Pickup; speed: number; upTo?: number }[] = [];
      while (w.t < 120 && !w.crashed) {
        safeBotStep(w);
        w.step(DT);
        for (const o of w.obstacles) if (!ids.has(o.id)) { ids.add(o.id); all.push({ o, speed: speedAt(w.t + 2) }); }
        for (const p of w.pickups) if (!tracked.some((x) => x.p === p)) tracked.push({ p, speed: speedAt(w.t + 2) });
        for (const x of tracked) {
          if (x.upTo === undefined && (x.p.collected || collectWindow(x.p)[1] < w.d)) x.upTo = all.length;
        }
      }
      for (const x of tracked) {
        if (x.upTo === undefined) continue; // run ended before it reached the bus
        const ivs = all.slice(0, x.upTo).flatMap(({ o, speed }) => occupancy(o, speed));
        expect(pickupIsSafe(x.p, ivs, x.speed), `seed ${seed} ${x.p.kind} lane ${x.p.lane}`).toBe(true);
        laterTraffic += all.length - x.upTo;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(SEEDS.length * 5);
    expect(laterTraffic).toBeGreaterThan(0);
  });

  it('a bot that goes for every pickup collects them, boosts, and never crashes', () => {
    let boosts = 0;
    let collected = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const w = new World(seed);
      while (w.t < 120 && !w.crashed) {
        const p = w.pickups.find((pk) => !pk.collected);
        const ivs = w.obstacles.flatMap((o) => occupancy(o, w.speed));
        const opts = { reaction: false, laneChangeMargin: 1.2 };
        if (p && !w.bus.moving && p.lane !== w.bus.target) {
          const dir = (p.lane > w.bus.target ? 1 : -1) as -1 | 1;
          if (hasSafePath(ivs, w.d, w.bus.target + dir, w.speed, opts)) w.move(dir);
        }
        safeBotStep(w);
        w.step(DT);
        for (const e of w.drainEvents()) {
          if (e.type === 'charm' && (e.what === 'chilli' || e.what === 'boostStart')) collected++;
          if (e.type === 'charm' && e.what === 'boostStart') boosts++;
        }
      }
      expect(w.crashed, `seed ${seed} crashed at t=${w.t.toFixed(1)}`).toBe(false);
      expect(w.saves, `seed ${seed} needed the lucky charm`).toBe(0);
    }
    expect(collected).toBeGreaterThan(40);
    expect(boosts).toBeGreaterThan(10);
  });
});

describe('captions', () => {
  it('every obstacle and pickup has a short one-liner that fits the strip above the road', () => {
    for (const k of ['lorry', 'tuktuk', 'bike', 'convoy', 'rival', 'chilli', 'lime'] as const) {
      const text = CAPTIONS[k];
      const w = [...text].reduce((n, c) => n + (FONT_SMALL[c] ?? FONT_SMALL[c.toUpperCase()]).w + 1, 0) - 1;
      expect(w, k).toBeLessThanOrEqual(228); // clear of the mute button
      expect(CAPTIONS.bike).toBe('FAMILY OF SIX. PLUS THE DOG.');
    }
  });

  it('each one is announced once per run, the first time it appears', () => {
    const w = new World(8);
    const seen: string[] = [];
    while (w.t < 90 && !w.crashed) {
      safeBotStep(w);
      w.step(DT);
      for (const e of w.drainEvents()) if (e.type === 'seen') seen.push(e.what);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toContain('lorry');
    expect(seen).toContain('chilli');
  });
});
