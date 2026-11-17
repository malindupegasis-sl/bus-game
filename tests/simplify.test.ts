import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { creditFontPx, visibleArea } from '../src/viewport';

describe('rotation-safe layout: the real visible area', () => {
  it('uses visualViewport (it excludes Safari/Chrome toolbars) rather than innerWidth/innerHeight', () => {
    const v = visibleArea({ innerWidth: 844, innerHeight: 390, visualViewport: { width: 844, height: 340, scale: 1, offsetLeft: 0, offsetTop: 0 } });
    expect(v).toEqual({ w: 844, h: 340, left: 0, top: 0, zoomed: false });
  });

  it('converts a zoomed viewport back to 1x and flags it so the zoom can be reset', () => {
    const v = visibleArea({ innerWidth: 390, innerHeight: 664, visualViewport: { width: 195, height: 332, scale: 2, offsetLeft: 40, offsetTop: 80 } });
    expect(v).toEqual({ w: 390, h: 664, left: 0, top: 0, zoomed: true });
  });

  it('falls back to innerWidth/innerHeight without visualViewport (or with a bogus one)', () => {
    expect(visibleArea({ innerWidth: 390, innerHeight: 844 })).toMatchObject({ w: 390, h: 844, zoomed: false });
    expect(visibleArea({ innerWidth: 390, innerHeight: 844, visualViewport: { width: 0, height: 0, scale: 1, offsetLeft: 0, offsetTop: 0 } })).toMatchObject({ w: 390, h: 844 });
  });
});

describe('start screen', () => {
  it('music credit is about half its old size (5 logical px tall) but never below 8px', () => {
    // Landscape iPhone: ~2.67 CSS px per logical px. Old cap height 13.3px -> new ~6.7px.
    const fs = creditFontPx(2.67);
    expect(fs * 0.7).toBeGreaterThan(5 * 2.67 * 0.45);
    expect(fs * 0.7).toBeLessThan(5 * 2.67 * 0.55);
    expect(creditFontPx(1.33)).toBe(8); // small portrait: readable floor
  });
});

describe('removed features are really gone', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|html|css)$/.test(f)) files.push(p);
    }
  };
  walk(join(__dirname, '../src'));
  files.push(join(__dirname, '../index.html'));
  const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');

  it('no route picker, Kandy scenery, garage or customisation code; old saved settings are never read', () => {
    for (const gone of ['busgame.garage', 'busgame.route', 'KANDY', 'sceneHills', 'btn-garage', 'btn-route', 'garage-row', 'openGarage', 'setRoute', 'BEST ON ROUTE']) {
      expect(all.includes(gone), gone).toBe(false);
    }
  });

  it('one high score, under the original key that already holds the 138 score', () => {
    expect(all.includes("HIGH_SCORE_KEY = 'busgame.highscore'")).toBe(true);
    expect(all.includes('highscore.1')).toBe(false);
  });
});
