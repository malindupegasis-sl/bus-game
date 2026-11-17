import { describe, expect, it } from 'vitest';
import { BUS_X, LANE_HALF_DOWN, LANE_HALF_UP, laneY } from '../src/config';
import { BOOST_TIME, TRANSITION_TIME, collect, newCharm, tickCharm } from '../src/game/charm';
import { BUS_HIT } from '../src/game/obstacles';
import { PICKUP_H, PICKUP_W, pickupDrawBox } from '../src/game/pickups';
import { World } from '../src/game/world';
import { Bus } from '../src/game/bus';
import { BUS_W, FRONT_CHARM, FRONT_CHARM_COL, busExtent, busLimits, busPose, frontCharmAnchor } from '../src/render/busPose';
import { SPRITES } from '../src/render/sprites';

describe('v2 Stage 1 feedback', () => {
  it('the boost lasts 11 s (5 s longer), then the ~1 s transition back; chipmunk music spans the boost', () => {
    expect(BOOST_TIME).toBe(11);
    expect(TRANSITION_TIME).toBe(1);
    const c = newCharm();
    collect(c, 'chilli');
    collect(c, 'chilli');
    collect(c, 'lime');
    let t = 0;
    let endAt = -1;
    let overAt = -1;
    while (t < 14) {
      t += 1 / 60;
      for (const e of tickCharm(c, 1 / 60)) {
        if (e === 'boostEnd') endAt = t; // main.ts turns chipmunk mode off on this event
        if (e === 'boostOver') overAt = t;
      }
    }
    expect(endAt).toBeCloseTo(11, 1);
    expect(overAt - endAt).toBeCloseTo(1, 1);
  });

  it('pickups are 2.5x bigger (chilli 25×30, lime 25×25) and still fit inside their lane', () => {
    expect(PICKUP_W).toBe(25);
    expect(SPRITES.chilli[0].length).toBe(25);
    expect(SPRITES.chilli.length).toBe(PICKUP_H.chilli);
    expect(SPRITES.lime[0].length).toBe(25);
    expect(SPRITES.lime.length).toBe(PICKUP_H.lime);
    expect(PICKUP_W / 10).toBe(2.5);
    expect(PICKUP_H.chilli / 12).toBe(2.5);
    for (const lane of [0, 1, 2]) {
      for (const kind of ['chilli', 'lime'] as const) {
        for (const bob of [0, 1] as const) {
          const b = pickupDrawBox(kind, laneY(lane), bob);
          expect(b.y).toBeGreaterThanOrEqual(laneY(lane) - LANE_HALF_UP);
          expect(b.bottom).toBeLessThanOrEqual(laneY(lane) + LANE_HALF_DOWN);
          expect(b.shadowY).toBeLessThanOrEqual(laneY(lane) + LANE_HALF_DOWN);
        }
      }
    }
  });

  it('collecting a pickup emits an event with where it was (for the flash, burst and popup)', () => {
    const w = new World(2);
    w.pickups.push({ id: 1, kind: 'chilli', lane: w.bus.target, d0: w.d, x0: BUS_X + 30, collected: false });
    w.step(1 / 60);
    const ev = w.drainEvents().find((e) => e.type === 'pickup');
    expect(ev).toMatchObject({ type: 'pickup', kind: 'chilli', lane: 1 });
    expect(w.charm.chillies).toBe(1);
  });

  it('the charm hangs just under the front bumper and stays inside the lane in every pose', () => {
    expect(FRONT_CHARM_COL).toBeGreaterThan(BUS_W * 0.85); // at the front of the bus
    const bus = new Bus();
    for (const script of [[-1], [1], [1, 1], [-1, -1]]) {
      bus.target = bus.pos = script[0] > 0 ? 0 : 2;
      let k = 0;
      for (let i = 0; i < 80; i++) {
        if (i % 6 === 0 && k < script.length) bus.move(script[k++] as -1 | 1);
        bus.update(1 / 120);
        const p = busPose({
          laneY: laneY(bus.pos), limits: busLimits(laneY, bus.pos, bus.target), d: i * 3, moveDir: bus.moveDir,
          moveProgress: bus.moveProgress, sinceArrival: bus.sinceArrival, live: true, now: i / 60,
        });
        const a = frontCharmAnchor(p, BUS_X);
        // Directly under the bumper's bottom row.
        expect(a.y).toBe(p.bodyBottom + p.bounce + Math.round((p.tilt * FRONT_CHARM_COL) / (BUS_W - 1)) + 1);
        const e = busExtent(p, BUS_X);
        expect(a.y + FRONT_CHARM.h - 1).toBeLessThanOrEqual(e.bottom);
        expect(a.x + 3).toBeLessThanOrEqual(e.right);
        if (!bus.moving) {
          expect(e.bottom).toBeLessThanOrEqual(Math.round(laneY(bus.target)) + LANE_HALF_DOWN);
          expect(a.y + FRONT_CHARM.h - 1).toBeLessThanOrEqual(Math.round(laneY(bus.target)) + LANE_HALF_DOWN);
        }
      }
    }
  });

  it("the charm doesn't change the bus's hitbox", () => {
    expect(BUS_HIT).toEqual({ x0: 6, x1: 68, halfH: 11 });
    // Collisions only use BUS_HIT; a charm hanging (or not) makes no difference.
    const a = new World(9, { pickups: false });
    const b = new World(9, { pickups: false });
    b.charm.chillies = 1;
    for (let i = 0; i < 600; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
      expect(!!a.findCollision()).toBe(!!b.findCollision());
    }
  });
});
