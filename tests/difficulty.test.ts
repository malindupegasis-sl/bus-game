import { describe, expect, it } from 'vitest';
import { MAX_MUSIC_RATE } from '../src/config';
import {
  DIFFICULTY, kindWeightsAt, maxObstaclesAt, musicRateForSpeed, rampProgress, spawnGapAt, speedAt,
} from '../src/game/difficulty';

const W = DIFFICULTY.warmupTime;
const times = Array.from({ length: 500 }, (_, i) => i * 0.5);

/** The v1.1 ramp, copied verbatim, so we can prove v1.2 is the same curve shifted by the warm-up. */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v11 = {
  speed: (t: number) => lerp(110, 230, 1 - (1 - clamp01(t / 90)) ** 2),
  gap: (t: number) => (t <= 90 ? lerp(1.3, 0.62, clamp01(t / 90)) : lerp(0.62, 0.45, clamp01((t - 90) / 60))),
  max: (t: number) => Math.round(lerp(2, 6, clamp01(t / 150))),
};

describe('warm-up', () => {
  it('lasts 20 seconds', () => expect(W).toBe(20));

  it('holds speed and traffic density at the starting level for the first 20s', () => {
    for (let t = 0; t <= W; t += 0.25) {
      expect(speedAt(t)).toBe(DIFFICULTY.startSpeed);
      expect(spawnGapAt(t)).toBe(DIFFICULTY.gapStart);
      expect(maxObstaclesAt(t)).toBe(DIFFICULTY.maxObstaclesStart);
      expect(rampProgress(t)).toBe(0);
    }
  });

  it('keeps the song at normal speed during the warm-up', () => {
    for (let t = 0; t <= W; t += 0.25) expect(musicRateForSpeed(speedAt(t))).toBe(1);
  });

  it('then runs the v1.1 ramp unchanged, 20 seconds later (same curve and caps)', () => {
    for (let x = 0; x <= 400; x += 0.37) {
      expect(speedAt(W + x)).toBeCloseTo(v11.speed(x), 9);
      expect(spawnGapAt(W + x)).toBeCloseTo(v11.gap(x), 9);
      expect(maxObstaclesAt(W + x)).toBe(v11.max(x));
    }
    expect(DIFFICULTY).toMatchObject({
      startSpeed: 110, maxSpeed: 230, rampTime: 90, denseTime: 150,
      gapStart: 1.3, gapAtRamp: 0.62, gapMin: 0.45, maxObstaclesStart: 2, maxObstaclesEnd: 6,
    });
  });

  it('starts ramping straight after the warm-up (no flat spot)', () => {
    expect(speedAt(W + 1)).toBeGreaterThan(DIFFICULTY.startSpeed);
    expect(spawnGapAt(W + 1)).toBeLessThan(DIFFICULTY.gapStart);
  });
});

describe('difficulty ramp', () => {
  it('reaches max speed at warm-up + ramp time, and stays there', () => {
    expect(speedAt(W + DIFFICULTY.rampTime)).toBeCloseTo(DIFFICULTY.maxSpeed);
    expect(speedAt(10_000)).toBeCloseTo(DIFFICULTY.maxSpeed);
  });

  it('speed never decreases and never exceeds the cap', () => {
    for (let i = 1; i < times.length; i++) {
      expect(speedAt(times[i])).toBeGreaterThanOrEqual(speedAt(times[i - 1]));
      expect(speedAt(times[i])).toBeLessThanOrEqual(DIFFICULTY.maxSpeed);
    }
  });

  it('ramps gradually: no big jump between frames', () => {
    for (let t = 0; t < 160; t += 1 / 60) expect(speedAt(t + 1 / 60) - speedAt(t)).toBeLessThan(0.1);
  });

  it('spawn gap never grows and bottoms out at the cap', () => {
    for (let i = 1; i < times.length; i++) expect(spawnGapAt(times[i])).toBeLessThanOrEqual(spawnGapAt(times[i - 1]));
    expect(spawnGapAt(W + DIFFICULTY.denseTime)).toBeCloseTo(DIFFICULTY.gapMin);
    expect(spawnGapAt(10_000)).toBeCloseTo(DIFFICULTY.gapMin);
  });

  it('allows more simultaneous obstacles over time, up to the cap', () => {
    expect(maxObstaclesAt(10_000)).toBe(DIFFICULTY.maxObstaclesEnd);
    for (let i = 1; i < times.length; i++) expect(maxObstaclesAt(times[i])).toBeGreaterThanOrEqual(maxObstaclesAt(times[i - 1]));
  });
});

describe('traffic mix weights', () => {
  it('tuk-tuks arrive after 8s on the real clock (they appear during the warm-up)', () => {
    expect(kindWeightsAt(0).tuktuk).toBe(0);
    expect(kindWeightsAt(20).tuktuk).toBeGreaterThan(0);
  });

  it('weights favour lorries, then tuk-tuks, with motorbikes rare', () => {
    // Raw weights are calibrated against the *measured* mix (the fairness check rejects some
    // candidates), so they move when the bus size changes. The measured mix itself
    // (~56% / ~34% / ~9.5%) is asserted in spawner.test.ts.
    const w = kindWeightsAt(60);
    expect(w.lorry).toBeGreaterThan(w.tuktuk);
    expect(w.tuktuk).toBeGreaterThan(w.bike * 4);
    expect(w.bike).toBeGreaterThan(0.1);
    expect(w.bike).toBeLessThan(0.2);
  });
});

describe('music rate', () => {
  it('speeds up with the game but is capped at 1.25x', () => {
    expect(MAX_MUSIC_RATE).toBe(1.25);
    expect(musicRateForSpeed(DIFFICULTY.startSpeed)).toBe(1);
    expect(musicRateForSpeed(DIFFICULTY.maxSpeed)).toBeCloseTo(1.25);
    expect(musicRateForSpeed(10_000)).toBe(1.25);
  });
});
