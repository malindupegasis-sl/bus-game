import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game/game';
import { DEFAULT_ROUTE, ROUTES, ROUTE_IDS, ROUTE_KEY, loadRoute, nextRoute, saveRoute } from '../src/game/routes';
import { HIGH_SCORE_KEY, highScoreKey, loadHighScore, saveHighScore } from '../src/game/score';
import { FONT_SMALL } from '../src/render/sprites';

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

afterEach(() => vi.unstubAllGlobals());

describe('routes', () => {
  it('offers the 138 (Colombo city) and Colombo to Kandy (route 1)', () => {
    expect(ROUTE_IDS).toEqual(['138', '1']);
    expect(ROUTES['138']).toMatchObject({ number: '138', theme: 'city' });
    expect(ROUTES['1']).toMatchObject({ number: '1', theme: 'hills' });
    expect(ROUTES['1'].name).toContain('KANDY');
    expect(DEFAULT_ROUTE).toBe('138');
    expect(nextRoute('138')).toBe('1');
    expect(nextRoute('1')).toBe('138');
  });

  it('remembers the chosen route on the device, with a safe fallback', () => {
    const s = memory();
    expect(loadRoute(s)).toBe('138');
    saveRoute('1', s);
    expect(loadRoute(s)).toBe('1');
    expect(loadRoute(memory({ [ROUTE_KEY]: '999' }))).toBe('138');
    const blocked = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadRoute(blocked)).toBe('138');
    expect(() => saveRoute('1', blocked)).not.toThrow();
  });

  it('every route number fits on the sign board (17px window)', () => {
    for (const r of Object.values(ROUTES)) {
      const w = [...r.number].reduce((n, c) => n + FONT_SMALL[c].w + 1, 0) - 1;
      expect(w).toBeLessThanOrEqual(17);
    }
  });
});

describe('separate high score per route', () => {
  it('the existing high score carries over to the 138; Kandy starts at 0; they never overwrite each other', () => {
    const s = memory({ [HIGH_SCORE_KEY]: '1240' }); // saved before routes existed
    expect(highScoreKey('138')).toBe(HIGH_SCORE_KEY);
    expect(loadHighScore(s, '138')).toBe(1240);
    expect(loadHighScore(s, '1')).toBe(0);
    expect(saveHighScore(900, s, '1')).toBe(900);
    expect(loadHighScore(s, '1')).toBe(900);
    expect(loadHighScore(s, '138')).toBe(1240);
    expect(saveHighScore(2000, s, '138')).toBe(2000);
    expect(loadHighScore(s, '1')).toBe(900);
  });

  it('the game shows and saves the high score of the route you are driving', () => {
    const s = memory({ [HIGH_SCORE_KEY]: '1240' });
    vi.stubGlobal('localStorage', s);
    const g = new Game(undefined, 3, '138');
    expect(g.highScore).toBe(1240);
    expect(g.setRoute('1')).toBe(true);
    expect(g.highScore).toBe(0);
    g.start(7);
    expect(g.setRoute('138')).toBe(false); // not mid-run
    while (g.phase === 'playing') g.update(1 / 60); // never steers: crashes eventually
    expect(g.highScore).toBe(g.world.score);
    expect(s.m.get(highScoreKey('1'))).toBe(String(g.world.score));
    expect(s.m.get(HIGH_SCORE_KEY)).toBe('1240'); // the 138's score untouched
  });
});

describe('gameplay is identical on every route', () => {
  it('same seed, same traffic, same crash, whichever route', () => {
    const run = (route: '138' | '1') => {
      const g = new Game(0, 1, route);
      g.start(12345);
      const log: string[] = [];
      while (g.phase === 'playing') {
        g.update(1 / 60);
        for (const o of g.world.obstacles) log.push(`${o.id}:${o.kind}:${o.lane}`);
      }
      return { log: [...new Set(log)].join('|'), t: g.world.t, score: g.world.score };
    };
    expect(run('1')).toEqual(run('138'));
  });
});
