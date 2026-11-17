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

/**
 * Each route keeps its own high score. Route 138 uses the original key, so a high score from
 * before routes existed carries over to the 138.
 */
export function highScoreKey(route = '138'): string {
  return route === '138' ? HIGH_SCORE_KEY : `${HIGH_SCORE_KEY}.${route}`;
}

export function loadHighScore(storage: StorageLike | null = defaultStorage(), route = '138'): number {
  try {
    const raw = storage?.getItem(highScoreKey(route));
    const n = raw == null ? 0 : parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Saves if `score` beats the stored value. Returns the (possibly new) high score. */
export function saveHighScore(score: number, storage: StorageLike | null = defaultStorage(), route = '138'): number {
  const best = loadHighScore(storage, route);
  if (score <= best) return best;
  try {
    storage?.setItem(highScoreKey(route), String(Math.floor(score)));
  } catch {
    /* storage full / blocked: keep the in-memory value */
  }
  return Math.floor(score);
}
