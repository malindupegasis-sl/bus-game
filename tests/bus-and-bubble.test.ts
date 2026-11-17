import { describe, expect, it } from 'vitest';
import { BUS_X, LANE_COUNT, LANE_HEIGHT, laneY } from '../src/config';
import { BUBBLE_TIME, SWEARS, bubbleRect, bubbleWindow, swearFor } from '../src/game/bubble';
import { BUS_HIT, BUS_SPRITE_W, KINDS, exitDistance, type Obstacle } from '../src/game/obstacles';
import { createRng } from '../src/game/rng';
import { makeObstacle } from '../src/game/spawner';
import { BUS_W, busExtent, busPose } from '../src/render/busPose';
import { BUS_H, FONT_SMALL, SPRITES } from '../src/render/sprites';

const textWidth = (s: string) => [...s].reduce((w, c) => w + FONT_SMALL[c].w + 1, 0) - 1;
const band = (lane: number) => ({ top: laneY(lane) - LANE_HEIGHT / 2, bottom: laneY(lane) + LANE_HEIGHT / 2 - 1 });

describe('bigger, animated bus', () => {
  it('is about 30% bigger than v1.1 (48×22)', () => {
    expect(BUS_W / 48).toBeGreaterThan(1.25);
    expect(BUS_W / 48).toBeLessThan(1.35);
    expect(BUS_H / 22).toBeGreaterThan(1.2);
    expect(BUS_H / 22).toBeLessThan(1.35);
    expect(BUS_SPRITE_W).toBe(SPRITES.bus[0].length);
  });

  it('stays inside its lane in every pose: bounce, lean up/down, any wheel frame', () => {
    expect(BUS_H).toBeLessThanOrEqual(LANE_HEIGHT);
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      for (const leanDir of [-1, 0, 1]) {
        for (let d = 0; d < 400; d += 1.7) {
          const p = busPose({ laneY: laneY(lane), d, leanDir, live: true, now: d / 100 });
          const e = busExtent(p);
          expect(e.top).toBeGreaterThanOrEqual(band(lane).top);
          expect(e.bottom).toBeLessThanOrEqual(band(lane).bottom);
        }
      }
    }
  });

  it('actually animates: wheels spin, the body bounces and leans, the glow flickers', () => {
    const frames = new Set<number>();
    const glows = new Set<number>();
    let bounced = false;
    for (let d = 0; d < 300; d += 1) {
      const p = busPose({ laneY: 58, d, leanDir: 0, live: true, now: d / 37 });
      frames.add(p.wheelFrame);
      glows.add(p.glow);
      if (p.columnOffset.every((o) => o === -1)) bounced = true;
    }
    expect(frames.size).toBe(4);
    expect(glows.size).toBeGreaterThan(2);
    expect(bounced).toBe(true);
    const up = busPose({ laneY: 58, d: 0, leanDir: -1, live: true, now: 0 }).columnOffset;
    expect(up[BUS_W - 1]).toBe(-1); // nose up when moving up
    expect(up[0]).toBe(0); // rear stays on its wheels
    // Exactly one step, at the door seam, so it reads as a tilt.
    const steps = up.filter((v, i) => i > 0 && v !== up[i - 1]).length;
    expect(steps).toBe(1);
    const down = busPose({ laneY: 58, d: 0, leanDir: 1, live: true, now: 0 }).columnOffset;
    expect(down[BUS_W - 1]).toBe(1);
  });

  it('keeps a fair hitbox: same proportions as v1.1, comfortably inside the sprite', () => {
    // v1.1: 40 of 48px long (83%), 14px of a 22px sprite tall (64%).
    expect((BUS_HIT.x1 - BUS_HIT.x0) / BUS_W).toBeCloseTo(40 / 48, 1);
    expect((2 * BUS_HIT.halfH) / BUS_H).toBeGreaterThan(0.6);
    expect((2 * BUS_HIT.halfH) / BUS_H).toBeLessThan(0.7);
    expect(BUS_HIT.x0).toBeGreaterThan(0);
    expect(BUS_HIT.x1).toBeLessThan(BUS_W);
    // Adjacent lanes never touch; a lane change clips at about the same point as v1.1 (42%).
    for (const k of Object.values(KINDS)) {
      expect(BUS_HIT.halfH + k.halfH).toBeLessThan(LANE_HEIGHT);
      expect(1 - (BUS_HIT.halfH + k.halfH) / LANE_HEIGHT).toBeGreaterThan(0.38);
    }
  });
});

describe('tuk-tuk swearing bubble', () => {
  it('uses censored symbol swearing, picked pseudo-randomly', () => {
    for (const s of SWEARS) {
      expect(s).toMatch(/[@#$%&*]/);
      expect(s).toMatch(/!$|!\?!$/);
      for (const c of s) expect(FONT_SMALL[c], `glyph '${c}'`).toBeDefined();
    }
    expect(SWEARS).toContain('H*$@O!!');
    expect(SWEARS).toContain('P@#$%A!!!');
    expect(SWEARS).toContain('#@$%&!!');
    const picks = new Set(Array.from({ length: 60 }, (_, i) => swearFor(i + 1)));
    expect(picks.size).toBe(SWEARS.length);
  });

  it('only swerving tuk-tuks shout, starting at the swerve, for about a second', () => {
    const rng = createRng(11);
    for (let i = 0; i < 300; i++) {
      const speed = 110 + (i % 7) * 20;
      const o = makeObstacle(i + 1, 'tuktuk', i % 3, 0, speed, rng);
      const win = bubbleWindow(o);
      if (o.toLane === o.lane) {
        expect(win).toBeNull();
        continue;
      }
      expect(win![0]).toBe(o.dSwerve);
      expect((win![1] - win![0]) / speed).toBeCloseTo(BUBBLE_TIME);
    }
  });

  it('never covers the lane the tuk-tuk is moving into, or the bus, and stays on screen', () => {
    const rng = createRng(5);
    let shown = 0;
    for (let i = 0; i < 600; i++) {
      const speed = 110 + (i % 7) * 20;
      const o: Obstacle = makeObstacle(i + 1, 'tuktuk', i % 3, 0, speed, rng);
      if (o.toLane === o.lane) continue;
      const target = band(o.toLane);
      for (let d = 0; d < exitDistance(o); d += 2) {
        const b = bubbleRect(o, d, textWidth);
        if (!b) continue;
        shown++;
        // The bubble (with its 1px pop bounce and tail) stays inside the origin lane's band.
        const top = b.y - 1;
        const bottom = b.y + b.h - 1;
        expect(bottom < target.top || top > target.bottom, `covers target lane ${o.toLane}`).toBe(true);
        expect(top).toBeGreaterThanOrEqual(band(o.lane).top);
        expect(bottom).toBeLessThanOrEqual(band(o.lane).bottom);
        expect(b.x - 2).toBeGreaterThan(BUS_X + BUS_W); // never over the bus
        expect(b.x + b.w).toBeLessThanOrEqual(256);
      }
    }
    expect(shown).toBeGreaterThan(1000);
  });
});
