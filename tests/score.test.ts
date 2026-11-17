import { describe, expect, it } from 'vitest';
import { DISTANCE_PER_POINT } from '../src/config';
import { formatScore, HIGH_SCORE_KEY, loadHighScore, saveHighScore, scoreFromDistance } from '../src/game/score';
import { World } from '../src/game/world';

function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('score', () => {
  it('goes up with distance', () => {
    expect(scoreFromDistance(0)).toBe(0);
    expect(scoreFromDistance(DISTANCE_PER_POINT * 10)).toBe(10);
    expect(scoreFromDistance(DISTANCE_PER_POINT * 10.9)).toBe(10);
    expect(scoreFromDistance(-5)).toBe(0);
    expect(scoreFromDistance(NaN)).toBe(0);
  });

  it('increases every frame during a run and faster as speed rises', () => {
    const w = new World(1);
    // Keep the road empty so the run doesn't end.
    let prev = 0;
    let early = 0;
    for (let i = 0; i < 60 * 100; i++) {
      w.obstacles = [];
      w.step(1 / 60);
      expect(w.score).toBeGreaterThanOrEqual(prev);
      prev = w.score;
      if (i === 60 * 10) early = w.score;
    }
    const last10 = w.score - scoreAt(w, 90);
    expect(last10).toBeGreaterThan(early);
  });

  it('formats with thousands separators', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1240)).toBe('1,240');
    expect(formatScore(1234567)).toBe('1,234,567');
  });

  it('saves only a better high score', () => {
    const s = memoryStorage();
    expect(loadHighScore(s)).toBe(0);
    expect(saveHighScore(500, s)).toBe(500);
    expect(saveHighScore(300, s)).toBe(500);
    expect(s.m.get(HIGH_SCORE_KEY)).toBe('500');
    expect(saveHighScore(1240, s)).toBe(1240);
    expect(loadHighScore(s)).toBe(1240);
  });

  it('survives broken or blocked storage', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadHighScore(throwing)).toBe(0);
    expect(saveHighScore(100, throwing)).toBe(100);
    expect(loadHighScore(memoryStorage({ [HIGH_SCORE_KEY]: 'garbage' }))).toBe(0);
    expect(loadHighScore(null)).toBe(0);
  });
});

/** Score a fresh empty-road run would have at time t (for comparing rates). */
function scoreAt(_w: World, t: number): number {
  const w = new World(1);
  while (w.t < t) {
    w.obstacles = [];
    w.step(1 / 60);
  }
  return w.score;
}

import { shareText, whatsappUrl } from '../src/share';
import { Game } from '../src/game/game';

describe('share + game over', () => {
  it('builds a wa.me link with the formatted score and live link', () => {
    expect(shareText(1240)).toBe('I scored 1,240 in Bus Game! Beat me: https://malindupegasis-sl.github.io/bus-game/');
    const url = whatsappUrl(1240);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe(shareText(1240));
  });

  it('a crash ends the run, records the score and reaches game over', () => {
    const g = new Game(0, 5);
    g.press(1); // title → start
    expect(g.phase).toBe('playing');
    for (let i = 0; i < 60 * 120 && g.phase === 'playing'; i++) g.update(1 / 60);
    expect(g.phase).toBe('crashed'); // never steering always crashes eventually
    expect(g.highScore).toBe(g.world.score);
    expect(g.newBest).toBe(g.world.score > 0);
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    expect(g.phase).toBe('over');
    expect(g.retry()).toBe(false); // too soon
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    expect(g.retry()).toBe(true);
    expect(g.phase).toBe('playing');
    expect(g.world.score).toBe(0);
  });

  it('a swipe against the tap direction wins, from the pre-tap lane', () => {
    const g = new Game(0, 5);
    g.start();
    expect(g.world.bus.target).toBe(1);
    g.press(-1, 1); // tap top half → up
    expect(g.world.bus.target).toBe(0);
    g.swipe(1, 1); // ...but the finger swiped down
    expect(g.world.bus.target).toBe(2);
    g.swipe(1, 1); // repeated swipe events in the same gesture do nothing more
    expect(g.world.bus.target).toBe(2);
    g.press(1, 2);
    g.swipe(1, 2); // swipe in the same direction as the tap: just one move
    expect(g.world.bus.target).toBe(2);
  });

  it('pauses and resumes', () => {
    const g = new Game(0, 5);
    g.start();
    g.update(0.5);
    const d = g.world.d;
    expect(g.pause()).toBe(true);
    g.update(1);
    expect(g.world.d).toBe(d);
    expect(g.press(1)).toBe('resume');
    expect(g.world.bus.target).toBe(1); // the resume tap doesn't steer
    g.update(0.1);
    expect(g.world.d).toBeGreaterThan(d);
  });
});
