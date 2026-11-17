import { DISTANCE_PER_POINT } from '../config';

export function scoreFromDistance(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return Math.floor(distance / DISTANCE_PER_POINT);
}

/** 1240 → "1,240" */
export function formatScore(score: number): string {
  return Math.max(0, Math.floor(score)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const HIGH_SCORE_KEY = 'busgame.highscore';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** One high score, under the original key (it already holds the player's 138 score). */
export function loadHighScore(storage: StorageLike | null = defaultStorage()): number {
  try {
    const raw = storage?.getItem(HIGH_SCORE_KEY);
    const n = raw == null ? 0 : parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Saves if `score` beats the stored value. Returns the (possibly new) high score. */
export function saveHighScore(score: number, storage: StorageLike | null = defaultStorage()): number {
  const best = loadHighScore(storage);
  if (score <= best) return best;
  try {
    storage?.setItem(HIGH_SCORE_KEY, String(Math.floor(score)));
  } catch {
    /* storage full / blocked: keep the in-memory value */
  }
  return Math.floor(score);
}
