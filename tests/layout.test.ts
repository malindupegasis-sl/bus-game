import { describe, expect, it } from 'vitest';
import { BUS_X, laneY, VIEW_H, VIEW_W } from '../src/config';
import { computeLayout, type Box } from '../src/layout';

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Everything the bus can draw in each lane: the whole lane band (33px), 74px long plus room for
 * squash, exhaust puffs and lane-change dust.
 */
function busBoxes(c: Box): Box[] {
  const s = c.w / VIEW_W;
  return [0, 1, 2].map((lane) => ({
    x: c.x + (BUS_X - 8) * s,
    y: c.y + (laneY(lane) - 16) * s,
    w: (74 + 12) * s,
    h: 33 * s,
  }));
}

const SCREENS: [string, number, number, number][] = [
  ['390×844 portrait', 390, 844, 3],
  ['844×390 landscape', 844, 390, 3],
  ['375×667 portrait', 375, 667, 2],
  ['667×375 landscape', 667, 375, 2],
  ['430×932 portrait', 430, 932, 3],
  ['932×430 landscape', 932, 430, 3],
  ['360×740 portrait', 360, 740, 3],
  ['740×360 landscape', 740, 360, 3],
  ['1280×800 desktop', 1280, 800, 1],
];

describe('thumb button layout', () => {
  for (const [name, w, h, dpr] of SCREENS) {
    it(`${name}: ▲ bottom-left, ▼ bottom-right, big, on screen, never over the bus`, () => {
      const l = computeLayout(w, h, dpr);
      const { up, down, canvas } = l;
      // Bottom corners
      expect(up.x).toBeLessThan(w / 4);
      expect(down.x + down.w).toBeGreaterThan((w * 3) / 4);
      for (const b of [up, down]) {
        expect(b.y + b.h).toBeGreaterThan(h * 0.8);
        expect(b.y + b.h).toBeLessThanOrEqual(h);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(w);
        expect(b.w).toBeGreaterThanOrEqual(80); // big thumb targets (Apple's minimum is 44)
      }
      expect(overlaps(up, down)).toBe(false);
      // The canvas fits and keeps its aspect ratio
      expect(canvas.w / canvas.h).toBeCloseTo(VIEW_W / VIEW_H, 3);
      expect(canvas.x).toBeGreaterThanOrEqual(-0.01);
      expect(canvas.y + canvas.h).toBeLessThanOrEqual(h + 0.01);
      // Never hide the bus in any lane
      for (const bus of busBoxes(canvas)) {
        expect(overlaps(up, bus), 'up over bus').toBe(false);
        expect(overlaps(down, bus), 'down over bus').toBe(false);
      }
      if (h > w) {
        expect(l.mode).toBe('below');
        expect(overlaps(up, canvas)).toBe(false); // portrait: buttons don't cover the game at all
      } else {
        // Landscape: full-size game with semi-transparent buttons overlaid below the road.
        expect(l.mode).toBe('overlay');
        expect(canvas.h).toBeGreaterThanOrEqual(h * 0.85); // whole-pixel scaling can leave a small margin
      }
    });
  }
});

import { HUD } from '../src/ui-layout';
import { HUD_TOP } from '../src/config';

describe('HUD', () => {
  const toScreen = (c: Box, r: { x: number; y: number; w: number; h: number }): Box => {
    const s = c.w / VIEW_W;
    return { x: c.x + r.x * s, y: c.y + r.y * s, w: r.w * s, h: r.h * s };
  };
  const SCREENS2: [string, number, number, number][] = [
    ['390×844', 390, 844, 3], ['844×390', 844, 390, 3], ['375×667', 375, 667, 2], ['667×375', 667, 375, 2],
    ['430×932', 430, 932, 3], ['932×430', 932, 430, 3], ['360×740', 360, 740, 3], ['740×360', 740, 360, 3],
    ['568×320 (iPhone SE 1st gen)', 568, 320, 2], ['1280×800', 1280, 800, 1],
  ];
  for (const [name, w, h, dpr] of SCREENS2) {
    it(`${name}: the thumb buttons never cover the score, charm icon or speed`, () => {
      const l = computeLayout(w, h, dpr);
      for (const r of [HUD.score, HUD.charmIcon, HUD.speed]) {
        const box = toScreen(l.canvas, r);
        expect(overlaps(l.up, box), `▲ over ${JSON.stringify(r)}`).toBe(false);
        expect(overlaps(l.down, box), `▼ over ${JSON.stringify(r)}`).toBe(false);
      }
    });
  }

  it('big digits and the charm icon fit inside their boxes; boxes fit the HUD and do not overlap', () => {
    const inside = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
    const digits = (d: { x: number; y: number; n: number }) => ({ x: d.x, y: d.y, w: d.n * HUD.digit.step - (HUD.digit.step - HUD.digit.w), h: HUD.digit.h });
    expect(inside(digits(HUD.scoreDigits), HUD.score)).toBe(true);
    expect(inside(digits(HUD.speedDigits), HUD.speed)).toBe(true);
    expect(inside(HUD.charmIcon, HUD.score)).toBe(true);
    expect(overlaps(digits(HUD.scoreDigits), HUD.charmIcon)).toBe(false);
    expect(overlaps(HUD.score, HUD.speed)).toBe(false);
    for (const r of [HUD.score, HUD.speed]) {
      expect(r.y).toBeGreaterThanOrEqual(HUD_TOP);
      expect(r.y + r.h).toBeLessThanOrEqual(VIEW_H);
    }
    expect(HUD.digit.h / 14).toBeGreaterThan(1.4); // bigger than the old 8×14 digits
  });
});
