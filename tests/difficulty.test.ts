import { describe, expect, it } from 'vitest';
import { MAX_MUSIC_RATE } from '../src/config';
import {
  DIFFICULTY, kindWeightsAt, maxObstaclesAt, musicRateForSpeed, rampProgress, spawnGapAt, speedAt,
} from '../src/game/difficulty';

const times = Array.from({ length: 400 }, (_, i) => i * 0.5);

describe('difficulty ramp', () => {
  it('starts at the start speed and reaches max speed at the end of the ramp', () => {
    expect(speedAt(0)).toBe(DIFFICULTY.startSpeed);
    expect(speedAt(DIFFICULTY.rampTime)).toBeCloseTo(DIFFICULTY.maxSpeed);
    expect(speedAt(10_000)).toBeCloseTo(DIFFICULTY.maxSpeed);
  });

  it('speed never decreases and never exceeds the cap', () => {
    for (let i = 1; i < times.length; i++) {
      expect(speedAt(times[i])).toBeGreaterThanOrEqual(speedAt(times[i - 1]));
      expect(speedAt(times[i])).toBeLessThanOrEqual(DIFFICULTY.maxSpeed);
    }
  });

  it('ramps gradually: no big jump between frames', () => {
    for (let t = 0; t < 120; t += 1 / 60) {
      expect(speedAt(t + 1 / 60) - speedAt(t)).toBeLessThan(0.1);
    }
    expect(rampProgress(DIFFICULTY.rampTime / 2)).toBeGreaterThan(0.5);
  });

  it('spawn gap shrinks over time (more obstacles) and bottoms out', () => {
    for (let i = 1; i < times.length; i++) {
      expect(spawnGapAt(times[i])).toBeLessThanOrEqual(spawnGapAt(times[i - 1]));
    }
    expect(spawnGapAt(0)).toBe(DIFFICULTY.gapStart);
    expect(spawnGapAt(DIFFICULTY.denseTime)).toBeCloseTo(DIFFICULTY.gapMin);
    expect(spawnGapAt(10_000)).toBeCloseTo(DIFFICULTY.gapMin);
  });

  it('allows more simultaneous obstacles over time', () => {
    expect(maxObstaclesAt(0)).toBe(DIFFICULTY.maxObstaclesStart);
    expect(maxObstaclesAt(10_000)).toBe(DIFFICULTY.maxObstaclesEnd);
    for (let i = 1; i < times.length; i++) {
      expect(maxObstaclesAt(times[i])).toBeGreaterThanOrEqual(maxObstaclesAt(times[i - 1]));
    }
  });

  it('v1.1 mix weights: motorbikes cut by 60%, lorries and tuk-tuks take the share', () => {
    const w = kindWeightsAt(60);
    expect(w.bike).toBeCloseTo(0.45 * 0.4);
    expect(w.lorry).toBeGreaterThan(1);
    expect(w.tuktuk).toBeGreaterThan(w.bike);
  });

  it('introduces tuk-tuks after a short warm-up', () => {
    expect(kindWeightsAt(0).tuktuk).toBe(0);
    expect(kindWeightsAt(60).tuktuk).toBeGreaterThan(0);
  });

  it('music speeds up with the game but is capped at 1.25x', () => {
    expect(MAX_MUSIC_RATE).toBe(1.25);
    expect(musicRateForSpeed(DIFFICULTY.startSpeed)).toBe(1);
    expect(musicRateForSpeed(DIFFICULTY.maxSpeed)).toBeCloseTo(1.25);
    expect(musicRateForSpeed(10_000)).toBe(1.25);
    expect(musicRateForSpeed(170)).toBeGreaterThan(1);
  });
});
