import { MAX_MUSIC_RATE } from '../config';
import type { ObstacleKind } from './obstacles';

/**
 * Difficulty ramp. All functions are pure functions of elapsed play time (seconds).
 * For the first WARMUP_TIME seconds speed and traffic density hold at the starting level. Then
 * the v1.1 ramp runs unchanged, just shifted: speed eases from START to MAX over RAMP_TIME, then
 * holds while traffic keeps getting denser until DENSE_TIME (both measured from the warm-up's end).
 */
export const DIFFICULTY = {
  warmupTime: 20, // seconds at the starting speed and density
  startSpeed: 110, // logical px/s
  maxSpeed: 230,
  rampTime: 90,
  denseTime: 150,
  gapStart: 1.3, // seconds between spawns at t=0
  gapAtRamp: 0.62, // ... at rampTime
  gapMin: 0.45, // ... at denseTime and beyond
  maxObstaclesStart: 2,
  maxObstaclesEnd: 6,
  tuktukFrom: 8, // tuk-tuks start appearing after this many seconds
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Seconds of ramp so far: 0 during the warm-up, then counting up. */
export function rampClock(t: number): number {
  return Math.max(0, t - DIFFICULTY.warmupTime);
}

/** 0 → 1 progress through the speed ramp (eased, monotonic). */
export function rampProgress(t: number): number {
  const x = clamp01(rampClock(t) / DIFFICULTY.rampTime);
  return 1 - (1 - x) * (1 - x); // ease-out quad
}

export function speedAt(t: number): number {
  return lerp(DIFFICULTY.startSpeed, DIFFICULTY.maxSpeed, rampProgress(t));
}

/** Average seconds between spawn attempts. Never increases with time. */
export function spawnGapAt(time: number): number {
  const d = DIFFICULTY;
  const t = rampClock(time);
  if (t <= d.rampTime) return lerp(d.gapStart, d.gapAtRamp, clamp01(t / d.rampTime));
  return lerp(d.gapAtRamp, d.gapMin, clamp01((t - d.rampTime) / (d.denseTime - d.rampTime)));
}

export function maxObstaclesAt(t: number): number {
  const d = DIFFICULTY;
  return Math.round(lerp(d.maxObstaclesStart, d.maxObstaclesEnd, clamp01(rampClock(t) / d.denseTime)));
}

/**
 * Relative spawn weights. Calibrated against what actually spawns (the fairness check rejects
 * some candidates), measured with a perfect bot over 60 runs of 150s:
 *   v1:   lorry 53.7%, tuk-tuk 22.9%, motorbike 23.3%
 *   v1.1: lorry 61.7%, tuk-tuk 29.1%, motorbike  9.2%  (motorbikes −60%, freed share split evenly)
 *   v1.2: lorry 56.3%, tuk-tuk 34.1%, motorbike  9.6%  (5 points moved from lorries to tuk-tuks;
 *         measured over 180s runs with the warm-up and the bigger bus)
 *   v1.3: lorry 56.4%, tuk-tuk 34.2%, motorbike  9.5%  (same mix; weights re-calibrated because the
 *         74px bus and 20s warm-up change which candidates pass the fairness check)
 * tests/spawner.test.ts checks the mix stays near these numbers.
 */
export const KIND_WEIGHTS = { lorry: 1.4, tuktuk: 0.87, bike: 0.135 } as const;

/** The mix uses the real clock (not the warm-up-shifted one), so tuk-tuks still arrive from 8s. */
export function kindWeightsAt(t: number): Record<ObstacleKind, number> {
  const tuk = t < DIFFICULTY.tuktukFrom ? 0 : KIND_WEIGHTS.tuktuk * clamp01((t - DIFFICULTY.tuktukFrom) / 20);
  return { lorry: KIND_WEIGHTS.lorry, tuktuk: tuk, bike: KIND_WEIGHTS.bike };
}

/** Music playback rate for a given game speed, capped at MAX_MUSIC_RATE. */
export function musicRateForSpeed(speed: number): number {
  const d = DIFFICULTY;
  const x = clamp01((speed - d.startSpeed) / (d.maxSpeed - d.startSpeed));
  return Math.min(MAX_MUSIC_RATE, 1 + x * (MAX_MUSIC_RATE - 1));
}
