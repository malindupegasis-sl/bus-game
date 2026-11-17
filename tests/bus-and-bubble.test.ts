import { describe, expect, it } from 'vitest';
import { BUS_X, HUD_TOP, LANE_HALF_DOWN, LANE_HALF_UP, LANE_HEIGHT, laneY } from '../src/config';
import { BUBBLE_TIME, SWEARS, bubbleRect, bubbleWindow, swearFor, type Box } from '../src/game/bubble';
import { Bus } from '../src/game/bus';
import { BUS_HIT, BUS_SPRITE_W, KINDS, VEHICLE_BASELINE_CHECK, exitDistance, obstacleLane, obstacleX } from './helpers';
import { createRng } from '../src/game/rng';
import { makeObstacle } from '../src/game/spawner';
import { BUS_W, TILT_MAX, busColumns, busExtent, busLimits, busPose } from '../src/render/busPose';
import { BUS_H, FONT_BIG, SPRITES } from '../src/render/sprites';

const bigWidth = (s: string) => [...s].reduce((w, c) => w + (FONT_BIG[c] ?? FONT_BIG[c.toUpperCase()]).w + 1, 0) - 1;
const band = (lane: number) => ({ top: laneY(lane) - LANE_HALF_UP, bottom: laneY(lane) + LANE_HALF_DOWN });
const DT = 1 / 120;

function poseOf(bus: Bus, d = 0, now = 0) {
  return busPose({
    laneY: laneY(bus.pos), limits: busLimits(laneY, bus.pos, bus.target), d, moveDir: bus.moveDir, moveProgress: bus.moveProgress,
    sinceArrival: bus.sinceArrival, live: true, now,
  });
}

describe('bigger bus', () => {
  it('is about 20% bigger than v1.2 (62×27)', () => {
    expect(BUS_W / 62).toBeGreaterThan(1.15);
    expect(BUS_W / 62).toBeLessThan(1.25);
    expect(BUS_H / 27).toBeGreaterThan(1.15);
    expect(BUS_H / 27).toBeLessThan(1.25);
    expect(BUS_SPRITE_W).toBe(SPRITES.bus[0].length);
    expect(BUS_H).toBeLessThanOrEqual(LANE_HEIGHT);
    expect(LANE_HALF_UP + LANE_HALF_DOWN + 1).toBe(LANE_HEIGHT);
    expect(VEHICLE_BASELINE_CHECK).toBeLessThanOrEqual(LANE_HALF_DOWN);
  });

  it('keeps v1.2 hitbox proportions (dodging feel unchanged)', () => {
    // v1.2: 52 of 62px long (84%), 18px of a 27px-tall sprite (67%); lane change clips ~43% in.
    expect((BUS_HIT.x1 - BUS_HIT.x0) / BUS_W).toBeCloseTo(52 / 62, 2);
    expect((2 * BUS_HIT.halfH) / BUS_H).toBeCloseTo(18 / 27, 1);
    for (const k of Object.values(KINDS)) {
      const clip = 1 - (BUS_HIT.halfH + k.halfH) / LANE_HEIGHT;
      expect(clip).toBeGreaterThan(0.38);
      expect(clip).toBeLessThan(0.52);
    }
  });

  it('stays in its lane when settled or landing, and between the two lanes while changing', () => {
    // Real Bus motion: single moves, and quick double taps that re-target mid-slide.
    const scripts: number[][] = [[1], [-1], [1, 1], [-1, -1], [1, -1], [-1, 1, 1]];
    for (const script of scripts) {
      for (const start of [0, 1, 2]) {
        const bus = new Bus();
        bus.target = bus.pos = start;
        let lo = start;
        let hi = start;
        let step = 0;
        for (let i = 0; i < 120; i++) {
          if (i % 7 === 0 && step < script.length) {
            if (bus.move(script[step++] as -1 | 1)) { lo = Math.min(lo, bus.target); hi = Math.max(hi, bus.target); }
          }
          bus.update(DT);
          const e = busExtent(poseOf(bus, i * 3, i / 60), BUS_X);
          if (bus.moving) {
            // Only between the lane it's in now and the lane it's heading for: never past it.
            const near = Math.min(bus.pos, bus.target);
            const far = Math.max(bus.pos, bus.target);
            expect(e.top, `moving ${script}`).toBeGreaterThanOrEqual(Math.round(laneY(near)) - LANE_HALF_UP);
            expect(e.bottom, `moving ${script}`).toBeLessThanOrEqual(Math.round(laneY(far)) + LANE_HALF_DOWN);
            expect(e.top).toBeGreaterThanOrEqual(band(lo).top);
            expect(e.bottom).toBeLessThanOrEqual(band(hi).bottom);
          } else {
            expect(e.top, `settled in ${bus.target}`).toBeGreaterThanOrEqual(band(bus.target).top);
            expect(e.bottom).toBeLessThanOrEqual(band(bus.target).bottom);
            lo = hi = bus.target;
          }
          expect(e.bottom).toBeLessThan(HUD_TOP);
        }
      }
    }
  });

  it('lane changes are clearly animated: >1px tilt, stretch mid-change, squash on landing', () => {
    const bus = new Bus();
    let maxTiltUp = 0;
    let maxH = 0;
    let minH = 99;
    let maxW = 0;
    bus.move(-1);
    for (let i = 0; i < 60; i++) {
      bus.update(DT);
      const p = poseOf(bus);
      maxTiltUp = Math.min(maxTiltUp, p.tilt);
      const cols = busColumns(p, BUS_X);
      maxH = Math.max(maxH, cols[0].dh);
      minH = Math.min(minH, cols[0].dh);
      maxW = Math.max(maxW, cols[cols.length - 1].dx + cols[cols.length - 1].dw - cols[0].dx);
    }
    expect(-maxTiltUp).toBe(TILT_MAX); // nose up 3px when moving up
    expect(TILT_MAX).toBeGreaterThan(1);
    expect(maxH).toBeGreaterThan(26); // stretched taller while moving
    expect(minH).toBeLessThan(26); // squashed on landing
    expect(maxW).toBeGreaterThan(BUS_W); // wider when squashed
    bus.move(1);
    bus.update(0.06);
    expect(poseOf(bus).tilt).toBeGreaterThan(1); // nose down when moving down
  });

  it('wheels spin and the glow flickers while cruising', () => {
    const frames = new Set<number>();
    const glows = new Set<number>();
    for (let d = 0; d < 200; d++) {
      const p = busPose({ laneY: 58, d, moveDir: 0, moveProgress: 1, sinceArrival: 9, live: true, now: d / 37 });
      frames.add(p.wheelFrame);
      glows.add(p.glow);
    }
    expect(frames.size).toBe(4);
    expect(glows.size).toBeGreaterThan(2);
  });
});

describe('tuk-tuk swearing bubble', () => {
  it('uses exactly the three phrases, picked pseudo-randomly, all printable in the 5×7 font', () => {
    expect([...SWEARS]).toEqual(['P#$%A!!', 'H#$%OO!!', 'Buruwa!!!']);
    for (const s of SWEARS) for (const c of s) expect(FONT_BIG[c], `5×7 glyph '${c}'`).toBeDefined();
    const picks = Array.from({ length: 300 }, (_, i) => swearFor(i + 1));
    for (const s of SWEARS) {
      const share = picks.filter((p) => p === s).length / picks.length;
      expect(share).toBeGreaterThan(0.2);
    }
  });

  it('shows for about a second from the start of the swerve, only on swerving tuk-tuks', () => {
    const rng = createRng(11);
    for (let i = 0; i < 300; i++) {
      const speed = 110 + (i % 7) * 20;
      const o = makeObstacle(i + 1, 'tuktuk', i % 3, 0, speed, rng);
      const win = bubbleWindow(o);
      if (o.toLane === o.lane) { expect(win).toBeNull(); continue; }
      expect(win![0]).toBe(o.dSwerve);
      expect((win![1] - win![0]) / speed).toBeCloseTo(BUBBLE_TIME);
    }
  });

  for (const scale of [1, 2]) {
    it(`(text ×${scale}) rides with the tuk-tuk through and after the swerve, and never touches the bus`, () => {
      const rng = createRng(5 + scale);
      let shown = 0;
      let afterSwerve = 0;
      const placements = new Set<string>();
      for (let i = 0; i < 500; i++) {
        const speed = 110 + (i % 7) * 20;
        const o = makeObstacle(i + 1, 'tuktuk', i % 3, 0, speed, rng);
        if (o.toLane === o.lane) continue;
        const busLane = (i * 7) % 3;
        const bus: Box = { x: BUS_X - 2, y: band(busLane).top, w: BUS_W + 4, h: LANE_HEIGHT };
        for (let d = 0; d < exitDistance(o); d += 2) {
          const b = bubbleRect(o, d, { textWidth: bigWidth, bus, scale });
          if (!b) continue;
          shown++;
          placements.add(b.tail);
          // Attached: within a few px of the tuk-tuk, wherever it is now.
          const tx = obstacleX(o, d);
          const ty = laneY(obstacleLane(o, d));
          const gapX = Math.max(0, b.x - (tx + 24), tx - (b.x + b.w));
          const gapY = Math.max(0, b.y - (ty + 15), ty + 15 - 19 - (b.y + b.h));
          expect(gapX + gapY, 'bubble attached to tuk-tuk').toBeLessThanOrEqual(6);
          if (d > o.dSwerveEnd) {
            afterSwerve++;
            // After the swerve it's with the tuk-tuk in its new lane, not left behind.
            expect(Math.abs(b.y + b.h / 2 - ty)).toBeLessThan(LANE_HEIGHT);
          }
          // Never over the bus (bubble plus its tail).
          const clear = b.x - 3 > bus.x + bus.w || b.x + b.w + 3 < bus.x || b.y - 3 > bus.y + bus.h || b.y + b.h + 3 < bus.y;
          expect(clear, 'bubble over the bus').toBe(true);
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(256);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.y + b.h).toBeLessThanOrEqual(HUD_TOP);
        }
      }
      expect(shown).toBeGreaterThan(500);
      expect(afterSwerve).toBeGreaterThan(100);
      expect(placements.size).toBeGreaterThanOrEqual(2); // falls back above/below when needed
    });
  }
});
