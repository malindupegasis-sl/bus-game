import { describe, expect, it } from 'vitest';
import { BUS_X, LANE_COUNT } from '../src/config';
import { BOOST_TIME, TRANSITION_TIME, collect } from '../src/game/charm';
import { hasSafePath, occupancy } from '../src/game/fairness';
import { COMBO_WINDOW, KNOCKOUT_POINTS, SUE_LINES, bumpCombo, newCombo } from '../src/game/knockout';
import type { Obstacle, ObstacleKind } from '../src/game/obstacles';
import { World } from '../src/game/world';
import { FONT_BIG } from '../src/render/sprites';

const DT = 1 / 60;
let nextId = 5000;

/** A vehicle parked right on the bus (forces a collision this step). */
function onBus(w: World, kind: ObstacleKind = 'lorry', lane = w.bus.target): Obstacle {
  return { id: nextId++, kind, d0: w.d, x0: BUS_X + 10, f: 0.001, lane, toLane: lane, dTell: Infinity, dSwerve: Infinity, dSwerveEnd: Infinity };
}

function boost(w: World): void {
  collect(w.charm, 'chilli');
  collect(w.charm, 'chilli');
  collect(w.charm, 'lime');
}

function knockEvents(w: World) {
  return w.drainEvents().filter((e) => e.type === 'knockout') as Extract<ReturnType<World['drainEvents']>[number], { type: 'knockout' }>[];
}

describe('knockouts', () => {
  it('boosted: a hit knocks the vehicle off the road for +25, doubled by the boost', () => {
    const w = new World(1, { pickups: false });
    boost(w);
    const o = onBus(w);
    w.obstacles.push(o);
    w.step(DT);
    expect(w.crashed).toBe(false);
    expect(w.obstacles).not.toContain(o); // gone from the road at once
    const ev = knockEvents(w);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ points: KNOCKOUT_POINTS * 2, combo: 1 });
    expect(KNOCKOUT_POINTS).toBe(25);
    expect(w.bonus).toBe(50);
    expect(w.knockouts).toBe(1);
  });

  it('during the ~1 s transition back it still knocks off, at the normal +25', () => {
    const w = new World(1, { pickups: false });
    w.charm.transitionT = TRANSITION_TIME / 2;
    w.obstacles.push(onBus(w, 'tuktuk'));
    w.step(DT);
    expect(w.crashed).toBe(false);
    expect(knockEvents(w)[0].points).toBe(25);
  });

  it('several vehicles hit in the same moment are all knocked off', () => {
    const w = new World(1, { pickups: false });
    boost(w);
    w.obstacles.push(onBus(w, 'lorry'), onBus(w, 'bike'), onBus(w, 'rival'));
    w.step(DT);
    expect(w.obstacles).toHaveLength(0);
    expect(knockEvents(w).map((e) => e.combo)).toEqual([1, 2, 3]);
  });

  it('combo: x2, x3... within 2 s of each other; it resets after a pause', () => {
    const c = newCombo();
    expect(bumpCombo(c, 10)).toBe(1);
    expect(bumpCombo(c, 11)).toBe(2);
    expect(bumpCombo(c, 11 + COMBO_WINDOW)).toBe(3);
    expect(bumpCombo(c, 11 + COMBO_WINDOW * 2 + 0.1)).toBe(1);
    // In the World, knockouts a second apart build the combo.
    const w = new World(2, { pickups: false });
    boost(w);
    const combos: number[] = [];
    for (let i = 0; i < 4; i++) {
      w.obstacles = [onBus(w, (['lorry', 'tuktuk', 'bike', 'rival'] as const)[i])];
      w.step(DT);
      combos.push(...knockEvents(w).map((e) => e.combo));
      for (let k = 0; k < 60; k++) { w.obstacles = []; w.step(DT); }
    }
    expect(combos).toEqual([1, 2, 3, 4]);
  });

  it('a convoy is knocked off as one (all 5 SUVs), and its bubble lines fit the 5×7 font', () => {
    const w = new World(3, { pickups: false });
    boost(w);
    const c = onBus(w, 'convoy');
    w.obstacles.push(c);
    w.step(DT);
    expect(w.obstacles).toHaveLength(0);
    expect(knockEvents(w)[0].obstacle.kind).toBe('convoy');
    expect(SUE_LINES).toContain("I'LL SUE!!");
    for (const s of SUE_LINES) for (const ch of s) expect(FONT_BIG[ch], ch).toBeDefined();
  });

  it('outside the boost nothing changes: crashes end the run, the lucky charm still saves, its blink passes through', () => {
    const a = new World(4, { pickups: false });
    a.obstacles.push(onBus(a));
    a.step(DT);
    expect(a.crashed).toBe(true);
    expect(a.knockouts).toBe(0);

    const b = new World(4, { pickups: false });
    b.charm.chillies = 2;
    const o = onBus(b);
    b.obstacles.push(o);
    b.step(DT);
    expect(b.crashed).toBe(false);
    expect(b.saves).toBe(1);
    expect(b.obstacles).toContain(o); // the blink passes through: not knocked off
    expect(b.knockouts).toBe(0);
  });
});

const SEEDS = Number(process.env.KO_SEEDS ?? 10);
describe('knocked-off vehicles never cause a crash', () => {
  it('a 35 s boost through heavy traffic, then normal driving: a crash is never with a knocked-off vehicle', () => {
    let knocked = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const w = new World(seed * 7919, { pickups: false });
      const gone = new Set<number>();
      const kinds = ['lorry', 'tuktuk', 'bike', 'convoy', 'rival'] as const;
      let n = 0;
      // Boost from 25 s to 60 s (re-boosting), with extra traffic aimed at the bus every 0.75 s.
      while (w.t < 75 && !w.crashed) {
        n++;
        if (w.t > 25 && w.t < 60 && w.charm.boostT < 1) w.charm.boostT = BOOST_TIME;
        if (w.t > 25 && w.t < 60 && n % 45 === 0) w.obstacles.push(onBus(w, kinds[(seed + n) % 5]));
        // Outside the boost a perfect bot drives (as in the fairness tests), checking 15 times a second.
        const boosting = w.t > 25 && w.t < 61;
        if (!boosting && !w.bus.moving && n % 4 === 0) {
          const ivs = w.obstacles.flatMap((o) => occupancy(o, w.speed));
          const opts = { reaction: false, laneChangeMargin: 1.2 };
          if (!hasSafePath(ivs, w.d, w.bus.target, w.speed, opts)) {
            for (const dir of [-1, 1] as const) {
              const nl = w.bus.target + dir;
              if (nl >= 0 && nl < LANE_COUNT && hasSafePath(ivs, w.d, nl, w.speed, opts)) { w.move(dir); break; }
            }
          }
        }
        w.step(DT);
        for (const e of w.drainEvents()) if (e.type === 'knockout') gone.add(e.obstacle.id);
        for (const o of w.obstacles) expect(gone.has(o.id), `seed ${seed}: knocked-off vehicle back on the road`).toBe(false);
      }
      if (w.crashed) expect(gone.has(w.crashedWith!.id), `seed ${seed}: crash with a knocked-off vehicle`).toBe(false);
      knocked += gone.size;
    }
    expect(knocked).toBeGreaterThan(SEEDS * 45);
  });
});
